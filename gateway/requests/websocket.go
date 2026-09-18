package requests

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha1"
	"encoding/base64"
	"log"
	"net/http"
	"strconv"
	"time"
	"unsafe"

	ujwt "ultragateway/core/jwt"
	"ultragateway/core/websocket/connections"
	"ultragateway/structs"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/cloudwego/hertz/pkg/common/utils"
	"github.com/cloudwego/hertz/pkg/network"
	"github.com/golang-jwt/jwt/v5"
)

const websocketMagicString = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

func B2S(b []byte) string {
	if len(b) == 0 {
		return ""
	}
	return unsafe.String(unsafe.SliceData(b), len(b))
}

func ComputeClientKey(clientKey []byte) ([]byte, string) {
	cleanKey := bytes.TrimSpace(clientKey)

	var hashBuffer [60]byte
	n := copy(hashBuffer[:], cleanKey)

	copy(hashBuffer[n:], websocketMagicString)

	hash := sha1.Sum(hashBuffer[:n+36])
	acceptKey := base64.StdEncoding.EncodeToString(hash[:])

	return cleanKey, acceptKey
}

func (instance *Requests) Websocket(mctx context.Context, ctx *app.RequestContext) {
	// Check if the request is a WebSocket upgrade request
	if !ctx.IsGet() || string(ctx.Request.Header.Peek("Upgrade")) != "websocket" {
		ctx.SetStatusCode(400)
		ctx.Write([]byte(`{"error": "This endpoint only supports WebSocket connections upgrades"}`))
		return
	}

	// Get the client key from the request header and compute the clean key and accept key
	clientKey := ctx.Request.Header.Peek("Sec-WebSocket-Key")
	clientProtocol := ctx.Request.Header.Peek("Sec-WebSocket-Protocol")
	clientVersion := ctx.Request.Header.Peek("Sec-WebSocket-Version")
	clientExtensions := ctx.Request.Header.Peek("Sec-WebSocket-Extensions")

	if len(clientKey) == 0 {
		ctx.SetStatusCode(400)
		ctx.Write([]byte(`{"error": "Missing header Sec-WebSocket-Key"}`))
		return
	}

	if len(clientProtocol) > 0 {
		ctx.Response.Header.SetBytesV("Sec-WebSocket-Protocol", clientProtocol)
	}

	cleanKey, acceptKey := ComputeClientKey(clientKey)

	// Parse the token & validate it
	var token *jwt.Token
	noToken, tokenParts := ujwt.GetTokenFromRequest(ctx)

	// validate with the public key
	if instance.Config.JWT.PublicKey != "" {
		if !noToken && tokenParts[0] == "Bearer" {
			err, data := ujwt.Validate(tokenParts[1], instance.Config.JWT.ECDSAPublicKey)

			if err != nil {
				log.Println(err)
				ctx.SetStatusCode(401)
				ctx.JSON(401, utils.H{"error": err.Error()})
				return
			}
			if data.Valid {
				token = data
			}
		}
	}

	// create the websocket connection context
	wsCtx := &structs.WSConnectionCtx{
		TokenType:  tokenParts[0],
		Token:      tokenParts[1],
		Meta:       map[string]string{},
		Authorized: token != nil,
	}

	// populate the meta fields from the token claims
	if token != nil && len(instance.Config.JWT.UseKeys) > 0 {
		for _, selector := range instance.Config.JWT.UseKeys {
			if value, ok := token.Claims.(jwt.MapClaims)[selector["key"]]; ok {
				if typeStr, hasType := selector["type"]; hasType {
					switch typeStr {
					case "string":
						wsCtx.Meta[selector["key"]] = value.(string)
					case "bool":
						wsCtx.Meta[selector["key"]] = strconv.FormatBool(value.(bool))
					}
				}
			}
		}
	}

	// set headers for upgrade
	ctx.SetStatusCode(101)
	ctx.Response.Header.Set("Upgrade", "websocket")
	ctx.Response.Header.Set("Connection", "Upgrade")
	ctx.Response.Header.Set("Sec-WebSocket-Accept", acceptKey)

	ctx.Response.SkipBody = true
	ctx.Response.Header.Del("Content-Type")
	ctx.Response.Header.Del("Transfer-Encoding")

	// hijack the connection and upgrade it to WebSocket
	ctx.Hijack(func(c network.Conn) {
		// set the deadline to infinity to avoid any timeouts
		c.SetDeadline(time.Time{})

		// recreate the http request from the original request to pass to the WebSocket handler
		httpRequest := &http.Request{
			Method: http.MethodGet,
			Header: http.Header{
				"Connection":            {"Upgrade"},
				"Upgrade":               {"websocket"},
				"Sec-Websocket-Version": {B2S(clientVersion)},
				"Sec-Websocket-Key":     {B2S(cleanKey)},
			},
		}

		// set the client extensions and protocol if they are provided
		if len(clientExtensions) > 0 {
			httpRequest.Header["Sec-Websocket-Extensions"] = []string{B2S(clientExtensions)}
		}
		if len(clientProtocol) > 0 {
			httpRequest.Header["Sec-Websocket-Protocol"] = []string{B2S(clientProtocol)}
		}

		// get a wrapper and reader from the pool and set them on the connection
		cWrapper := instance.WebsocketManager.WrapperPool.Get().(*structs.GwsConnWrapper)
		cWrapper.Conn = c
		cWrapper.HandshakeSwallowed = false

		br := instance.WebsocketManager.ReaderPool.Get().(*bufio.Reader)
		br.Reset(c)

		// set the buf reader on the context
		wsCtx.BufReader = br

		// upgrade the connection to a websocket connection
		gwsConn, err := instance.WebsocketManager.Upgrader.UpgradeFromConn(cWrapper, br, httpRequest)

		// handle the error if the upgrade fails
		if err != nil {
			log.Printf("Failed to upgrade websocket connection: %v", err)
			_ = c.Close()
			instance.WebsocketManager.WrapperPool.Put(cWrapper)
			instance.WebsocketManager.ReaderPool.Put(br)
			return
		}

		// add the connection to the connection manager
		conn_err := instance.WebsocketManager.Connections.Add(&connections.NewConnOptions{
			Conn: gwsConn,
			Ctx:  wsCtx,
		})

		// handle the error if the connection fails
		if conn_err != nil {
			log.Printf("Websocket lifecycle closed with error: %v", conn_err)
		}
	})
}
