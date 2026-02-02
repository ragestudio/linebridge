package requests

import (
	"net/http"
	"strconv"
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

	// create the context
	ctx := &structs.WSConnectionCtx{
		Token:      tokenString,
		Meta:       map[string]string{},
		Authorized: token != nil,
	}

	// inject meta data, if config defines.
	// only must inject if token has been successfully verified
	if token != nil && len(instance.Config.JWT.UseKeys) > 0 {
		for _, selector := range instance.Config.JWT.UseKeys {
			if value, ok := token.Claims.(jwt.MapClaims)[selector["key"]]; ok {
				if typeStr, hasType := selector["type"]; hasType {
					switch typeStr {
					case "string":
						ctx.Meta[selector["key"]] = value.(string)
					case "bool":
						ctx.Meta[selector["key"]] = strconv.FormatBool(value.(bool))
					default:
						continue
					}
				} else {
					continue
				}
			}
		}
	}

	// add the connection to the manager
	instance.WebsocketManager.Connections.Add(&connections.NewConnOptions{
		Conn: conn,
		Ctx:  ctx,
	})
}
