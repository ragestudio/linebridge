package websocket

import (
	"context"
	"os"
	"strconv"
	"testing"
	"time"
	uredis "ultragateway/core/redis"
	"ultragateway/core/websocket/connections"
	"ultragateway/structs"

	"github.com/lxzan/gws"
	goredis "github.com/redis/go-redis/v9"
)

func newPresenceTestInstance(t *testing.T) *Instance {
	t.Helper()

	url := os.Getenv("PRESENCE_TEST_REDIS_URL")

	if url == "" {
		t.Skip("PRESENCE_TEST_REDIS_URL is not set")
	}

	options, err := goredis.ParseURL(url)

	if err != nil {
		t.Fatalf("invalid redis url: %v", err)
	}

	client := goredis.NewClient(options)

	if err := client.FlushDB(context.Background()).Err(); err != nil {
		t.Fatalf("failed to flush test db: %v", err)
	}

	t.Cleanup(func() {
		client.Close()
	})

	return &Instance{
		Redis:           &uredis.Instance{Client: client},
		Connections:     &connections.ConnectionManager{},
		PresenceTTL:     time.Minute,
		PresenceRefresh: 10 * time.Second,
	}
}

func newPresenceTestCtx(connID, userID string) *structs.WSConnectionCtx {
	ctx := &structs.WSConnectionCtx{
		ID:   connID,
		Meta: map[string]string{},
	}

	if userID != "" {
		ctx.Meta["user_id"] = userID
	}

	ctx.InitHeartbeat(time.Now().Unix())

	return ctx
}

func liveUnix() string {
	return strconv.FormatInt(time.Now().Unix(), 10)
}

func TestPresenceTrackAndUntrack(t *testing.T) {
	instance := newPresenceTestInstance(t)
	ctx := newPresenceTestCtx("socket-1", "user-1")
	rc := instance.Redis.Client
	bg := context.Background()

	instance.presenceTrack(ctx)

	if members := rc.SMembers(bg, presenceUserKey("user-1")).Val(); len(members) != 1 || members[0] != "socket-1" {
		t.Fatalf("expected user set to contain socket-1, got %v", members)
	}

	fields := rc.HGetAll(bg, presenceSocketKey("socket-1")).Val()

	if fields["user_id"] != "user-1" || fields["connected_at"] == "" {
		t.Fatalf("unexpected socket hash %v", fields)
	}

	if count := rc.ZCount(bg, presenceGlobalUsersKey, "("+liveUnix(), "+inf").Val(); count != 1 {
		t.Fatalf("expected one live user in the global zset, got %d", count)
	}

	instance.presenceUntrack(ctx)

	if count := rc.SCard(bg, presenceUserKey("user-1")).Val(); count != 0 {
		t.Fatalf("expected user set to be empty, got %d", count)
	}

	if exists := rc.Exists(bg, presenceSocketKey("socket-1")).Val(); exists != 0 {
		t.Fatal("expected socket hash to be removed")
	}

	if count := rc.ZCount(bg, presenceGlobalUsersKey, "("+liveUnix(), "+inf").Val(); count != 0 {
		t.Fatalf("expected no live users, got %d", count)
	}
}

func TestPresenceMultipleSocketsKeepUserOnline(t *testing.T) {
	instance := newPresenceTestInstance(t)
	rc := instance.Redis.Client
	bg := context.Background()

	first := newPresenceTestCtx("socket-1", "user-1")
	second := newPresenceTestCtx("socket-2", "user-1")

	instance.presenceTrack(first)
	instance.presenceTrack(second)

	if count := rc.SCard(bg, presenceUserKey("user-1")).Val(); count != 2 {
		t.Fatalf("expected two sockets, got %d", count)
	}

	instance.presenceUntrack(first)

	if count := rc.SCard(bg, presenceUserKey("user-1")).Val(); count != 1 {
		t.Fatalf("expected one socket left, got %d", count)
	}

	if count := rc.ZCount(bg, presenceGlobalUsersKey, "("+liveUnix(), "+inf").Val(); count != 1 {
		t.Fatalf("expected the user to stay online, got %d", count)
	}

	instance.presenceUntrack(second)

	if count := rc.ZCount(bg, presenceGlobalUsersKey, "("+liveUnix(), "+inf").Val(); count != 0 {
		t.Fatalf("expected the user to go offline, got %d", count)
	}
}

func TestPresenceSwitchUser(t *testing.T) {
	instance := newPresenceTestInstance(t)
	rc := instance.Redis.Client
	bg := context.Background()

	ctx := newPresenceTestCtx("socket-1", "user-1")
	instance.presenceTrack(ctx)

	// the client authenticated again with a token for another user
	ctx.Meta["user_id"] = "user-2"
	instance.presenceSwitchUser(ctx, "user-1")

	if count := rc.SCard(bg, presenceUserKey("user-1")).Val(); count != 0 {
		t.Fatalf("expected the old user to be offline, got %d", count)
	}

	if count := rc.SCard(bg, presenceUserKey("user-2")).Val(); count != 1 {
		t.Fatalf("expected the new user to have one socket, got %d", count)
	}

	if user := rc.HGet(bg, presenceSocketKey("socket-1"), "user_id").Val(); user != "user-2" {
		t.Fatalf("expected the socket hash to point to user-2, got %q", user)
	}

	if count := rc.ZCount(bg, presenceGlobalUsersKey, "("+liveUnix(), "+inf").Val(); count != 1 {
		t.Fatalf("expected one live user, got %d", count)
	}

	if score := rc.ZScore(bg, presenceGlobalUsersKey, "user-1").Val(); score != 0 {
		t.Fatal("expected the old user to be removed from the global list")
	}
}

func TestPresenceReconcilePrunesExpiredUsers(t *testing.T) {
	instance := newPresenceTestInstance(t)
	rc := instance.Redis.Client
	bg := context.Background()

	// a member left behind by an instance that died
	rc.ZAdd(bg, presenceGlobalUsersKey, goredis.Z{
		Score:  float64(time.Now().Add(-time.Minute).Unix()),
		Member: "stale-user",
	})

	instance.reconcilePresence()

	if count := rc.ZCard(bg, presenceGlobalUsersKey).Val(); count != 0 {
		t.Fatalf("expected the expired member to be pruned, got %d", count)
	}
}

func TestPresenceReconcileKeepsLiveConnections(t *testing.T) {
	instance := newPresenceTestInstance(t)
	rc := instance.Redis.Client
	bg := context.Background()

	ctx := newPresenceTestCtx("socket-1", "user-1")
	instance.presenceTrack(ctx)

	instance.Connections.Clients.Store("socket-1", &gws.Conn{})
	instance.Connections.UsersRef.Store("user-1", &structs.WSUserConnections{
		Conns: map[string]struct{}{"socket-1": {}},
	})

	rc.PExpire(bg, presenceUserKey("user-1"), time.Second)
	rc.PExpire(bg, presenceSocketKey("socket-1"), time.Second)

	instance.reconcilePresence()

	if ttl := rc.PTTL(bg, presenceUserKey("user-1")).Val(); ttl < 30*time.Second {
		t.Fatalf("expected the user key to be refreshed, got %v", ttl)
	}

	if ttl := rc.PTTL(bg, presenceSocketKey("socket-1")).Val(); ttl < 30*time.Second {
		t.Fatalf("expected the socket key to be refreshed, got %v", ttl)
	}

	if count := rc.ZCount(bg, presenceGlobalUsersKey, "("+liveUnix(), "+inf").Val(); count != 1 {
		t.Fatalf("expected one live user, got %d", count)
	}
}

func TestPresenceReconcileDoesNotResurrectClosedSockets(t *testing.T) {
	instance := newPresenceTestInstance(t)
	rc := instance.Redis.Client
	bg := context.Background()

	ctx := newPresenceTestCtx("socket-1", "user-1")
	instance.presenceTrack(ctx)
	instance.presenceUntrack(ctx)

	// simulate the race where the connection is still visible when a
	// reconcile pass starts
	instance.Connections.Clients.Store("socket-1", &gws.Conn{})
	instance.Connections.UsersRef.Store("user-1", &structs.WSUserConnections{
		Conns: map[string]struct{}{"socket-1": {}},
	})

	instance.reconcilePresence()

	if count := rc.SCard(bg, presenceUserKey("user-1")).Val(); count != 0 {
		t.Fatalf("expected no resurrected sockets, got %d", count)
	}

	if exists := rc.Exists(bg, presenceSocketKey("socket-1")).Val(); exists != 0 {
		t.Fatal("expected no resurrected socket hash")
	}

	if count := rc.ZCard(bg, presenceGlobalUsersKey).Val(); count != 0 {
		t.Fatalf("expected no resurrected user, got %d", count)
	}
}

func TestPresenceReconcileRestoresLostKeys(t *testing.T) {
	instance := newPresenceTestInstance(t)
	rc := instance.Redis.Client
	bg := context.Background()

	ctx := newPresenceTestCtx("socket-1", "user-1")
	instance.presenceTrack(ctx)

	instance.Connections.Clients.Store("socket-1", &gws.Conn{})
	instance.Connections.UsersRef.Store("user-1", &structs.WSUserConnections{
		Conns: map[string]struct{}{"socket-1": {}},
	})

	// simulate a redis restart, all presence keys are gone but the
	// connection is still alive
	rc.Del(bg, presenceUserKey("user-1"), presenceSocketKey("socket-1"), presenceGlobalUsersKey)

	instance.reconcilePresence()

	if count := rc.SCard(bg, presenceUserKey("user-1")).Val(); count != 1 {
		t.Fatalf("expected the user key to be restored, got %d", count)
	}

	if user := rc.HGet(bg, presenceSocketKey("socket-1"), "user_id").Val(); user != "user-1" {
		t.Fatalf("expected the socket hash to be restored, got %q", user)
	}

	if count := rc.ZCount(bg, presenceGlobalUsersKey, "("+liveUnix(), "+inf").Val(); count != 1 {
		t.Fatalf("expected the global entry to be restored, got %d", count)
	}
}
