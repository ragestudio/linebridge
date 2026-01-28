package app

import (
	"context"
	"fmt"
	"os"
	"strings"

	infisical "github.com/infisical/go-sdk"
)

func LoadInfisicalEnvs(appData *AppData) {
	infisicalClient := infisical.NewInfisicalClient(context.Background(), infisical.Config{})

	_, err := infisicalClient.Auth().UniversalAuthLogin(os.Getenv("INFISICAL_CLIENT_ID"), os.Getenv("INFISICAL_CLIENT_SECRET"))

	if err != nil {
		fmt.Printf("Authentication failed: %v", err)
		os.Exit(1)
	}

	infisicalEnv, err := infisicalClient.Secrets().List(infisical.ListSecretsOptions{
		Environment: strings.ToLower(appData.Config.Mode),
		ProjectID:   os.Getenv("INFISICAL_PROJECT_ID"),
		SecretPath:  "/",
	})

	if err != nil {
		fmt.Printf("Error: %v", err)
		os.Exit(1)
	}

	appData.InfisicalEnv = make(map[string]string)

	for _, secret := range infisicalEnv {
		appData.InfisicalEnv[secret.SecretKey] = secret.SecretValue
	}
}
