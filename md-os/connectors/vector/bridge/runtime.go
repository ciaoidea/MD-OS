package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

func privateRuntimeDir() (string, error) {
	dir := os.Getenv("CORTEX_VECTOR_RUNTIME_DIR")
	if dir == "" {
		dir = "/run/vector-cortex"
	}
	dir = filepath.Clean(dir)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return "", err
	}
	if err := os.Chmod(dir, 0700); err != nil {
		return "", err
	}
	return dir, nil
}

func privateDataDir() (string, error) {
	if configured := strings.TrimSpace(os.Getenv("CORTEX_VECTOR_DATA_DIR")); configured != "" {
		return filepath.Clean(configured), nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".local", "share", "vector-cortex"), nil
}

func certificatePaths() (string, string, error) {
	dataDir, err := privateDataDir()
	if err != nil {
		return "", "", err
	}
	certFile := strings.TrimSpace(os.Getenv("CORTEX_VECTOR_CERT"))
	keyFile := strings.TrimSpace(os.Getenv("CORTEX_VECTOR_KEY"))
	if certFile == "" {
		certFile = filepath.Join(dataDir, "certs", "ep.crt")
	}
	if keyFile == "" {
		keyFile = filepath.Join(dataDir, "certs", "ep.key")
	}
	if certFile == keyFile {
		return "", "", fmt.Errorf("certificate and key paths must differ")
	}
	return filepath.Clean(certFile), filepath.Clean(keyFile), nil
}

func privateProfilePath() (string, error) {
	dataDir, err := privateDataDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dataDir, "profile.json"), nil
}
