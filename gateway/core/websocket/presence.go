package websocket

import (
	"context"
	"log"
	"strconv"
	"time"
	"ultragateway/structs"

	"github.com/redis/go-redis/v9"
)

const (
	presenceGlobalUsersKey = "presence:global_users"
	presenceUserPrefix     = "presence:user:"
	presenceSocketPrefix   = "presence:sockets:"
	presenceClosedPrefix   = "presence:closed:"

	presenceWriteAttempts = 3
	presenceTimeout       = 3 * time.Second
	presenceReconcileTTL  = 30 * time.Second
	presenceFlushBatch    = 4000
	// how long a closed socket is remembered so a reconcile pass can not
	// bring it back
	presenceClosedTTL = 5 * time.Minute
)

// removes one socket from the presence indexes
// a tombstone is written first, so a concurrent repair can not resurrect it
// KEYS: user key, socket key, tombstone key
// ARGV: conn id, user id, tombstone ttl ms
const presenceUntrackScript = `
	redis.call('SET', KEYS[3], '1', 'PX', ARGV[3])
	redis.call('SREM', KEYS[1], ARGV[1])
	redis.call('DEL', KEYS[2])
	if redis.call('SCARD', KEYS[1]) == 0 then
		redis.call('ZREM', 'presence:global_users', ARGV[2])
	end
	return 1
`

// restores a live socket whose keys were lost, used after a redis restart
// KEYS: user key, socket key, tombstone key
// ARGV: conn id, user id, ttl ms, connected at, expiry score
const presenceRepairScript = `
	if redis.call('EXISTS', KEYS[3]) == 1 then
		return 0
	end
	redis.call('SADD', KEYS[1], ARGV[1])
	redis.call('PEXPIRE', KEYS[1], ARGV[3])
	redis.call('HSET', KEYS[2], 'user_id', ARGV[2], 'connected_at', ARGV[4])
	redis.call('PEXPIRE', KEYS[2], ARGV[3])
	redis.call('ZADD', 'presence:global_users', ARGV[5], ARGV[2])
	return 1
`

// moves one socket between two users, used on re-authentication
// KEYS: old user key, new user key, socket key
// ARGV: conn id, old user id, new user id, ttl ms, expiry score, connected at
const presenceSwitchUserScript = `
	if ARGV[2] ~= '' then
		redis.call('SREM', KEYS[1], ARGV[1])
		if redis.call('SCARD', KEYS[1]) == 0 then
			redis.call('ZREM', 'presence:global_users', ARGV[2])
		end
	end
	if ARGV[3] ~= '' then
		redis.call('SADD', KEYS[2], ARGV[1])
		redis.call('PEXPIRE', KEYS[2], ARGV[4])
		redis.call('HSET', KEYS[3], 'user_id', ARGV[3], 'connected_at', ARGV[6])
		redis.call('PEXPIRE', KEYS[3], ARGV[4])
		redis.call('ZADD', 'presence:global_users', ARGV[5], ARGV[3])
	else
		redis.call('DEL', KEYS[3])
	end
	return 1
`

func presenceUserKey(userID string) string {
	return presenceUserPrefix + userID
}

func presenceSocketKey(connID string) string {
	return presenceSocketPrefix + connID
}

func presenceClosedKey(connID string) string {
	return presenceClosedPrefix + connID
}

type presenceLiveRef struct {
	connID      string
	connectedAt int64
}

type presenceSocketRef struct {
	connID      string
	userID      string
	connectedAt int64
	expire      *redis.BoolCmd
}

func (manager *Instance) presenceEnabled() bool {
	return manager.PresenceEnabled && manager.Redis != nil
}

// presenceWrite runs a presence mutation, retrying transient redis errors
func (manager *Instance) presenceWrite(op string, connID string, fn func(context.Context) error) {
	if !manager.presenceEnabled() {
		return
	}

	for attempt := 1; attempt <= presenceWriteAttempts; attempt++ {
		ctx, cancel := context.WithTimeout(context.Background(), presenceTimeout)
		err := fn(ctx)
		cancel()

		if err == nil {
			return
		}

		if attempt == presenceWriteAttempts {
			log.Printf("websocket | presence %s failed for [%s]: %v", op, connID, err)
			return
		}

		time.Sleep(time.Duration(attempt) * 100 * time.Millisecond)
	}
}

// presenceTrack registers the socket in the presence indexes
func (manager *Instance) presenceTrack(connCtx *structs.WSConnectionCtx) {
	userID := connCtx.UserID()

	if !manager.presenceEnabled() || userID == "" {
		return
	}

	userKey := presenceUserKey(userID)
	socketKey := presenceSocketKey(connCtx.ID)
	expiry := time.Now().Add(manager.PresenceTTL).Unix()
	ttl := manager.PresenceTTL

	manager.presenceWrite("track", connCtx.ID, func(ctx context.Context) error {
		// a transaction keeps the user set and the global list in sync
		pipe := manager.Redis.Client.TxPipeline()
		pipe.SAdd(ctx, userKey, connCtx.ID)
		pipe.PExpire(ctx, userKey, ttl)
		pipe.HSet(ctx, socketKey, map[string]any{
			"user_id":      userID,
			"connected_at": connCtx.ConnectedAt(),
		})
		pipe.PExpire(ctx, socketKey, ttl)
		pipe.ZAdd(ctx, presenceGlobalUsersKey, redis.Z{
			Score:  float64(expiry),
			Member: userID,
		})

		_, err := pipe.Exec(ctx)

		return err
	})
}

// presenceUntrack removes the socket from the presence indexes
func (manager *Instance) presenceUntrack(connCtx *structs.WSConnectionCtx) {
	userID := connCtx.UserID()

	if !manager.presenceEnabled() || userID == "" {
		return
	}

	manager.presenceWrite("untrack", connCtx.ID, func(ctx context.Context) error {
		return manager.Redis.Client.Eval(
			ctx,
			presenceUntrackScript,
			[]string{
				presenceUserKey(userID),
				presenceSocketKey(connCtx.ID),
				presenceClosedKey(connCtx.ID),
			},
			connCtx.ID,
			userID,
			presenceClosedTTL.Milliseconds(),
		).Err()
	})
}

// presenceSwitchUser moves the socket from the old user to the current one
func (manager *Instance) presenceSwitchUser(connCtx *structs.WSConnectionCtx, oldUserID string) {
	newUserID := connCtx.UserID()

	if !manager.presenceEnabled() {
		return
	}

	if oldUserID == newUserID {
		return
	}

	expiry := time.Now().Add(manager.PresenceTTL).Unix()

	manager.presenceWrite("switch", connCtx.ID, func(ctx context.Context) error {
		return manager.Redis.Client.Eval(
			ctx,
			presenceSwitchUserScript,
			[]string{
				presenceUserKey(oldUserID),
				presenceUserKey(newUserID),
				presenceSocketKey(connCtx.ID),
			},
			connCtx.ID,
			oldUserID,
			newUserID,
			manager.PresenceTTL.Milliseconds(),
			expiry,
			connCtx.ConnectedAt(),
		).Err()
	})
}

// StartPresenceReconciler keeps the presence keys alive and removes entries
// left behind by an instance that died without closing its connections
func (manager *Instance) StartPresenceReconciler() {
	if !manager.presenceEnabled() {
		return
	}

	go func() {
		ticker := time.NewTicker(manager.PresenceRefresh)
		defer ticker.Stop()

		// first pass removes members published by a previous run
		manager.reconcilePresence()

		for range ticker.C {
			manager.reconcilePresence()
		}
	}()
}

func (manager *Instance) reconcilePresence() {
	now := time.Now()
	expiry := now.Add(manager.PresenceTTL)
	ttl := manager.PresenceTTL

	ctx, cancel := context.WithTimeout(context.Background(), presenceReconcileTTL)
	defer cancel()

	pipe := manager.Redis.Client.Pipeline()
	pending := 0
	users := 0

	sockets := make([]presenceSocketRef, 0, 1024)
	missing := make([]presenceSocketRef, 0, 64)

	flush := func() {
		if pending == 0 {
			return
		}

		if _, err := pipe.Exec(ctx); err != nil && IsDebug {
			log.Printf("websocket | presence reconcile failed: %v", err)
		}

		// PExpire reports false when the key is gone, those sockets are
		// repaired on this pass
		for _, socket := range sockets {
			if socket.expire == nil || !socket.expire.Val() {
				missing = append(missing, socket)
			}
		}

		sockets = sockets[:0]
		pipe = manager.Redis.Client.Pipeline()
		pending = 0
	}

	manager.Connections.UsersRef.Range(func(key, value any) bool {
		userID, ok := key.(string)

		if !ok || userID == "" {
			return true
		}

		refs, ok := value.(*structs.WSUserConnections)

		if !ok {
			return true
		}

		// only refresh sockets that are still connected
		live := make([]presenceLiveRef, 0, 8)

		refs.Mutex.Lock()
		for connID := range refs.Conns {
			if _, ok := manager.Connections.Clients.Load(connID); !ok {
				continue
			}

			connectedAt := now.Unix()

			if connCtx, ok := manager.Connections.GetConnCtx(connID); ok {
				connectedAt = connCtx.ConnectedAt()
			}

			live = append(live, presenceLiveRef{connID: connID, connectedAt: connectedAt})
		}
		refs.Mutex.Unlock()

		if len(live) == 0 {
			return true
		}

		userKey := presenceUserKey(userID)

		// PExpire is a noop when the key no longer exists and ZAddXX only
		// updates known members, so a concurrent untrack always wins
		pipe.PExpire(ctx, userKey, ttl)
		pipe.ZAddXX(ctx, presenceGlobalUsersKey, redis.Z{
			Score:  float64(expiry.Unix()),
			Member: userID,
		})
		pending += 2

		for _, ref := range live {
			expireCmd := pipe.PExpire(ctx, presenceSocketKey(ref.connID), ttl)

			sockets = append(sockets, presenceSocketRef{
				connID:      ref.connID,
				userID:      userID,
				connectedAt: ref.connectedAt,
				expire:      expireCmd,
			})

			pending++

			if pending >= presenceFlushBatch {
				flush()
			}
		}

		users++

		return true
	})

	flush()

	// restore sockets whose keys were lost, the tombstone check inside the
	// script prevents a closed socket from coming back
	for _, socket := range missing {
		pipe.Eval(
			ctx,
			presenceRepairScript,
			[]string{
				presenceUserKey(socket.userID),
				presenceSocketKey(socket.connID),
				presenceClosedKey(socket.connID),
			},
			socket.connID,
			socket.userID,
			ttl.Milliseconds(),
			socket.connectedAt,
			expiry.Unix(),
		)

		pending++

		if pending >= presenceFlushBatch {
			flush()
		}
	}

	flush()

	// a member whose expiry score is in the past belongs to an instance
	// that stopped refreshing it
	if err := manager.Redis.Client.ZRemRangeByScore(
		ctx,
		presenceGlobalUsersKey,
		"-inf",
		strconv.FormatInt(now.Unix(), 10),
	).Err(); err != nil && IsDebug {
		log.Printf("websocket | presence prune failed: %v", err)
	}

	if IsDebug {
		log.Printf("websocket | presence reconciled %d users, repaired %d sockets", users, len(missing))
	}
}
