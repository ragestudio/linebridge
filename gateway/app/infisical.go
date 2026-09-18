package app

import (
	"context"
	"fmt"
	"log"
	"os"
	"strings"

	infisical "github.com/infisical/go-sdk"
)

func LoadInfisicalEnvs(appData *App) {
	envString := strings.ToLower(appData.Config.Mode)

	log.Printf("Loading Infisical environment variables from [%s] mode", envString)

	infisicalClient := infisical.NewInfisicalClient(context.Background(), infisical.Config{})

	_, err := infisicalClient.Auth().UniversalAuthLogin(os.Getenv("INFISICAL_CLIENT_ID"), os.Getenv("INFISICAL_CLIENT_SECRET"))

	if err != nil {
		fmt.Printf("Authentication failed: %v", err)
		os.Exit(1)
	}

	infisicalEnv, err := infisicalClient.Secrets().List(infisical.ListSecretsOptions{
		Environment: envString,
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

	// remove the infisical secrets itself from env
	os.Unsetenv("INFISICAL_CLIENT_ID")
	os.Unsetenv("INFISICAL_CLIENT_SECRET")
	os.Unsetenv("INFISICAL_PROJECT_ID")
}
