package jwt

import (
	"crypto/ecdsa"
	"strings"

	"github.com/cloudwego/hertz/pkg/app"
	"github.com/golang-jwt/jwt/v5"
)

func GetTokenFromRequest(ctx *app.RequestContext) (bool, []string) {
	queryToken := string(ctx.Query("token"))
	headerToken := string(ctx.Request.Header.Peek("Authorization"))

	if headerToken != "" {
		if strings.HasPrefix(headerToken, "Bearer ") {
			return false, strings.Split(headerToken, " ")
		}
	}

	if queryToken != "" {
		return false, []string{"Bearer", queryToken}
	}

	return true, []string{"", ""}
}

func Validate(tokenString string, ECDSAPublicKey *ecdsa.PublicKey) (error, *jwt.Token) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (any, error) {
		return ECDSAPublicKey, nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodES256.Alg()}))

	if err != nil {
		return err, nil
	}

	return nil, token
}
