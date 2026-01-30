package services

import (
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/fsnotify/fsnotify"
)

func attachWatcherToService(s *Service) error {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return err
	}

	s.mutex.Lock()
	s.Watcher = watcher
	s.mutex.Unlock()

	go func() {
		defer watcher.Close()

		for {
			select {
			case <-s.ctx.Done():
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

	// ignore node_modules
	if strings.Contains(filename, "node_modules") {
		return true
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
	// don't watch node_modules directories
	return strings.Contains(path, "node_modules")
}
