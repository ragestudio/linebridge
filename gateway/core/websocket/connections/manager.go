package connections

import (
	"errors"
	"sync"
	"ultragateway/structs"

	"github.com/lxzan/gws"
	nanoid "github.com/matoous/go-nanoid/v2"
)

type ConnectionManager struct {
	Clients  sync.Map
	UsersRef sync.Map
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

	// store the connection
	manager.Clients.Store(options.Ctx.ID, options.Conn)

	// store the context
	options.Conn.Session().Store(structs.WSCtxStoreKey, options.Ctx)

	// if user_id specified, store the connection reference by its id
	if options.Ctx.UserID != "" {
		userRefs, _ := manager.UsersRef.LoadOrStore(options.Ctx.UserID, &structs.WSUserConnections{
			Conns: make(map[string]struct{}),
		})

		// cast
		refs := userRefs.(*structs.WSUserConnections)

		// store the connection id
		refs.Mu.Lock()
		refs.Conns[options.Ctx.ID] = struct{}{}
		refs.Mu.Unlock()
	}

	// create "THE LOOP"
	options.Conn.ReadLoop()

	return nil
}

func (manager *ConnectionManager) Remove(conn *gws.Conn) (*structs.WSConnectionCtx, error) {
	val, ok := conn.Session().Load(structs.WSCtxStoreKey)

	if !ok {
		return nil, errors.New("connection context not found")
	}

	// cast the connection context
	connCtx := val.(*structs.WSConnectionCtx)

	manager.Clients.Delete(connCtx.ID)

	// delete the session context (just in case)
	conn.Session().Delete(structs.WSCtxStoreKey)

	// delete the userid refs if any
	if connCtx.UserID != "" {
		// load the user connections
		userRefs, ok := manager.UsersRef.Load(connCtx.UserID)

		if ok {
			refs := userRefs.(*structs.WSUserConnections)

			refs.Mu.Lock()
			defer refs.Mu.Unlock()

			delete(refs.Conns, connCtx.ID)

			if len(refs.Conns) == 0 {
				manager.UsersRef.Delete(connCtx.UserID)
			}
		}
	}

	return connCtx, nil
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
	val, ok := conn.Session().Load(structs.WSCtxStoreKey)

	if !ok {
		return nil, false
	}

	return val.(*structs.WSConnectionCtx), true
}

func (manager *ConnectionManager) GetUserIDConnections(userID string) *structs.WSUserConnections {
	val, ok := manager.UsersRef.Load(userID)

	if !ok {
		return nil
	}

	return val.(*structs.WSUserConnections)
}
