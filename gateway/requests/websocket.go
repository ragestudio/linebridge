package requests

import (
	"net/http"
	"strings"
	"ultragateway/core/websocket/connections"
	"ultragateway/structs"

	"github.com/golang-jwt/jwt/v5"
)

func getToken(request *http.Request) (bool, string) {
	queryToken := request.URL.Query().Get("token")
	headerToken := request.Header.Get("Authorization")

	if headerToken != "" {
		if strings.HasPrefix(headerToken, "Bearer ") {
			return false, strings.Split(headerToken, " ")[1]
		}
	}

	if queryToken != "" {
		return false, queryToken
	}

	return true, ""
}

func JWTAuth(tokenString string, signedKey string) (error, *jwt.Token) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (any, error) {
		return []byte(signedKey), nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}))

	if err != nil {
		return err, nil
	}

	return nil, token
}

func (instance *Requests) Websocket(writter http.ResponseWriter, request *http.Request) {
	// just check if the request is a websocket upgrade
	if string(request.Header.Get("Upgrade")) != "websocket" {
		writter.WriteHeader(400)
		writter.Write([]byte("{'error': 'This endpoint only supports WebSocket connections upgrades'}"))

		return
	}

	// allocate the jwt token if later might be needed
	var token *jwt.Token

	// extract the token
	emptyTokenString, tokenString := getToken(request)

	// check if JWT Authorize is enabled
	if instance.Config.JWT.Secret != "" {
		if !emptyTokenString {
			err, data := JWTAuth(tokenString, instance.Config.JWT.Secret)

			if err != nil {
				writter.WriteHeader(401)
				writter.Write([]byte("Unauthorized"))

				return
			}

			if data.Valid {
				token = data
			}
		}
	}

	// peform the gws upgrade
	conn, err := instance.WebsocketManager.Upgrader.Upgrade(
		writter,
		request,
	)

	if err != nil {
		writter.WriteHeader(500)
		writter.Write([]byte("{'error': 'Failed to upgrade WebSocket'}"))

		return
	}

	// TODO: Implement custom connection context structures,
	// using the provided app config or whatever.
	ctx := &structs.WSConnectionCtx{
		Token: tokenString,
	}

	// by now inject with comty-standard jwt authorized schema
	if token != nil {
		claims := token.Claims.(jwt.MapClaims)

		ctx.UserID = claims["user_id"].(string)
		ctx.SessionID = claims["session_id"].(string)
		ctx.Username = claims["username"].(string)
	}

	// add the connection to the manager
	instance.WebsocketManager.Connections.Add(&connections.NewConnOptions{
		Conn: conn,
		Ctx:  ctx,
	})
}
