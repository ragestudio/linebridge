package services

import (
	"context"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/fsnotify/fsnotify"
)

var IGNORED_DIRS = []string{
	"node_modules",
	".cache",
	"dist",
}

// attachWatcherToService starts a watcher for the service directory
// the caller must hold the service mutex or call it during construction
func attachWatcherToService(s *Service, ctx context.Context) error {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return err
	}

	s.Watcher = watcher

	go func() {
		defer watcher.Close()

		for {
			select {
			case <-ctx.Done():
				return
			case event, ok := <-watcher.Events:
				if !ok {
					return
				}

				// filter out node_modules and temporary files
				if shouldIgnoreFileEvent(event.Name) {
					continue
				}

				if event.Has(fsnotify.Write) {
					log.Printf("Service [%s] file modified: %s, triggering hot-reload", s.ID, event.Name)
					s.Restart()
				}

				if event.Has(fsnotify.Create) {
					// check if the created path is a directory
					info, err := os.Stat(event.Name)

					if err == nil && info.IsDir() && !shouldIgnoreDirectory(event.Name) {
						log.Printf("Service [%s] new directory created: %s, adding to watcher", s.ID, event.Name)
						watcher.Add(event.Name)
					}
				}

				if event.Has(fsnotify.Remove) {
					log.Printf("Service [%s] deletion: %s, removing from watcher", s.ID, event.Name)
					watcher.Remove(event.Name)
				}
			case err, ok := <-watcher.Errors:
				if !ok {
					return
				}
				log.Printf("Service [%s] watcher error: %v", s.ID, err)
			}
		}
	}()

	// watch the service directory recursively
	err = filepath.Walk(s.Cwd, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		if info.IsDir() && !shouldIgnoreDirectory(path) {
			return watcher.Add(path)
		}

		return nil
	})

	return err
}

func shouldIgnoreFileEvent(filename string) bool {
	baseName := filepath.Base(filename)

	for _, dir := range IGNORED_DIRS {
		if strings.Contains(filename, dir) {
			return true
		}
	}

	// ignore common temporary files
	if strings.HasPrefix(baseName, ".") ||
		strings.HasSuffix(baseName, "~") ||
		strings.HasSuffix(baseName, ".tmp") ||
		strings.HasSuffix(baseName, ".swp") ||
		strings.HasSuffix(baseName, ".swx") {
		return true
	}

	return false
}

func shouldIgnoreDirectory(path string) bool {
	for _, dir := range IGNORED_DIRS {
		if strings.Contains(path, dir) {
			return true
		}
	}
	return false
}
