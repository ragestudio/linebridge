package jwt

import (
	"crypto/ecdsa"
	"strconv"
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

// ExtractClaims builds the connection meta map from the configured use_keys
// every key listed on the config is reset, so a re-authentication with a
// token that no longer carries a claim removes the stale value
func ExtractClaims(claims jwt.MapClaims, useKeys []map[string]string) map[string]string {
	meta := make(map[string]string, len(useKeys))

	for _, selector := range useKeys {
		key := selector["key"]

		if key == "" {
			continue
		}

		value, ok := claims[key]

		if !ok {
			continue
		}

		switch selector["type"] {
		case "string":
			if str, ok := value.(string); ok {
				meta[key] = str
			}
		case "bool":
			if boolean, ok := value.(bool); ok {
				meta[key] = strconv.FormatBool(boolean)
			}
		}
	}

	return meta
}
