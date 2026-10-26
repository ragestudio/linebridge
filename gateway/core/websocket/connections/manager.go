package connections

import (
	"errors"
	"fmt"
	"log"
	"sync"
	"time"
	"ultragateway/core/websocket/internal_events"
	"ultragateway/structs"

	ujwt "ultragateway/core/jwt"

	"github.com/golang-jwt/jwt/v5"
	"github.com/lxzan/gws"
	nanoid "github.com/matoous/go-nanoid/v2"
)

type ConnectionManager struct {
	Clients        sync.Map
	UsersRef       sync.Map
	InternalEvents *internal_events.InternalEvents
	Config         *structs.BaseConfig
}

type NewConnOptions struct {
	Conn *gws.Conn
	Ctx  *structs.WSConnectionCtx
}

func (manager *ConnectionManager) Add(options *NewConnOptions) error {
	var err error

	// generate the connection id
	if options.Ctx.ID, err = nanoid.New(); err != nil {
		return err
	}

	// seed the heartbeat before the connection becomes visible
	// the heartbeat scheduler and the presence reconciler both read it
	options.Ctx.InitHeartbeat(time.Now().Unix())

	// store the connection
	manager.Clients.Store(options.Ctx.ID, options.Conn)

	// store the context
	options.Conn.Session().Store(structs.WSCtxStoreKey, options.Ctx)

	// if user_id specified, store the connection reference by its id
	manager.bindUserConn(options.Ctx.ID, options.Ctx.UserID())

	// trigger new conn event
	manager.InternalEvents.Trigger("connection", &struct {
		Ctx  *structs.WSConnectionCtx
		Conn *gws.Conn
	}{
		Ctx:  options.Ctx,
		Conn: options.Conn,
	})

	// create "THE LOOP"
	// a panic inside the connection lifecycle must not take down the process
	defer func() {
		if recovered := recover(); recovered != nil {
			log.Printf("websocket | panic in connection [%s]: %v", options.Ctx.ID, recovered)
			_ = options.Conn.NetConn().Close()
		}
	}()

	options.Conn.ReadLoop()

	return nil
}

func (manager *ConnectionManager) Remove(conn *gws.Conn) (*structs.WSConnectionCtx, error) {
	if conn == nil {
		return nil, errors.New("connection context not found")
	}

	session := conn.Session()

	if session == nil {
		return nil, errors.New("connection context not found")
	}

	val, ok := session.Load(structs.WSCtxStoreKey)

	if !ok {
		return nil, errors.New("connection context not found")
	}

	// cast the connection context
	connCtx := val.(*structs.WSConnectionCtx)

	manager.Clients.Delete(connCtx.ID)

	// delete the session context (just in case)
	session.Delete(structs.WSCtxStoreKey)

	// delete the userid refs if any
	manager.unbindUserConn(connCtx.ID, connCtx.UserID())

	manager.InternalEvents.Trigger("disconnection", &struct {
		Ctx  *structs.WSConnectionCtx
		Conn *gws.Conn
	}{
		Ctx:  connCtx,
		Conn: conn,
	})

	return connCtx, nil
}

func (manager *ConnectionManager) bindUserConn(connID, userID string) {
	if connID == "" || userID == "" {
		return
	}

	userRefs, _ := manager.UsersRef.LoadOrStore(userID, &structs.WSUserConnections{
		Conns: make(map[string]struct{}),
	})

	refs := userRefs.(*structs.WSUserConnections)

	refs.Mutex.Lock()
	refs.Conns[connID] = struct{}{}
	refs.Mutex.Unlock()
}

func (manager *ConnectionManager) unbindUserConn(connID, userID string) {
	if connID == "" || userID == "" {
		return
	}

	userRefs, ok := manager.UsersRef.Load(userID)

	if !ok {
		return
	}

	refs := userRefs.(*structs.WSUserConnections)

	refs.Mutex.Lock()
	defer refs.Mutex.Unlock()

	delete(refs.Conns, connID)

	if len(refs.Conns) == 0 {
		manager.UsersRef.Delete(userID)
	}
}

// RebindUser moves a connection to a different user, used when a client
// authenticates after the connection was already opened
func (manager *ConnectionManager) RebindUser(connID, oldUserID, newUserID string) {
	if oldUserID == newUserID {
		return
	}

	manager.unbindUserConn(connID, oldUserID)
	manager.bindUserConn(connID, newUserID)
}

func (manager *ConnectionManager) GetConn(socketID string) (*gws.Conn, bool) {
	val, ok := manager.Clients.Load(socketID)

	if !ok {
		return nil, false
	}

	return val.(*gws.Conn), true
}

func (manager *ConnectionManager) GetConnCtx(socketID string) (*structs.WSConnectionCtx, bool) {
	conn, ok := manager.GetConn(socketID)

	if !ok {
		return nil, false
	}

	return manager.LoadConnCtx(conn)
}

func (manager *ConnectionManager) LoadConnCtx(conn *gws.Conn) (*structs.WSConnectionCtx, bool) {
	if conn == nil {
		return nil, false
	}

	session := conn.Session()

	if session == nil {
		return nil, false
	}

	val, ok := session.Load(structs.WSCtxStoreKey)

	if !ok {
		return nil, false
	}

	connCtx, ok := val.(*structs.WSConnectionCtx)

	if !ok {
		return nil, false
	}

	return connCtx, true
}

func (manager *ConnectionManager) GetUserIDConnections(userID string) *structs.WSUserConnections {
	val, ok := manager.UsersRef.Load(userID)

	if !ok {
		return nil
	}

	return val.(*structs.WSUserConnections)
}

// Authenticate validates a new token and rebinds the connection to the user
// carried by it. Returns the previous user id so the caller can update the
// presence indexes.
func (manager *ConnectionManager) Authenticate(conn *gws.Conn, token string) (*structs.WSConnectionCtx, string, error) {
	if token == "" {
		return nil, "", fmt.Errorf("token is required for authentication")
	}

	connCtx, ok := manager.LoadConnCtx(conn)

	if !ok {
		return nil, "", fmt.Errorf("no context found for connection")
	}

	err, parsed := ujwt.Validate(token, manager.Config.JWT.ECDSAPublicKey)

	if err != nil {
		return nil, "", err
	}

	oldUserID := connCtx.UserID()

	if parsed != nil {
		if claims, ok := parsed.Claims.(jwt.MapClaims); ok {
			meta := ujwt.ExtractClaims(claims, manager.Config.JWT.UseKeys)

			// every configured key is reset, a claim missing from the new
			// token must not keep the previous value
			for _, selector := range manager.Config.JWT.UseKeys {
				key := selector["key"]

				if key == "" {
					continue
				}

				value, exists := meta[key]

				if exists {
					connCtx.Meta[key] = value
				} else {
					delete(connCtx.Meta, key)
				}
			}
		}
	}

	newUserID := connCtx.UserID()

	// the user document attached at handshake time belongs to the old user
	if oldUserID != newUserID {
		delete(connCtx.Meta, "user")
	}

	connCtx.Token = token
	connCtx.Authorized = true

	if oldUserID != newUserID {
		manager.RebindUser(connCtx.ID, oldUserID, newUserID)
	}

	return connCtx, oldUserID, nil
}
