package services

import (
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/fsnotify/fsnotify"
)

func AttachWatcherToService(service *Service) error {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return err
	}

	service.Mutex.Lock()
	service.Watcher = watcher
	service.Mutex.Unlock()

	go func() {
		defer watcher.Close()

		for {
			select {
			case <-service.ctx.Done():
				return
			case event, ok := <-watcher.Events:
				if !ok {
					return
				}

				if strings.Contains(event.Name, "node_modules") {
					continue
				}

				log.Printf("Service [%s] file event: %v", service.ID, event)

				if event.Has(fsnotify.Write) {
					log.Printf("Service [%s] file modified: %s", service.ID, event.Name)
					service.requestRestart()
				}
			case err, ok := <-watcher.Errors:
				if !ok {
					return
				}
				log.Printf("Service [%s] watcher error: %v", service.ID, err)
			}
		}
	}()

	err = filepath.Walk(service.Cwd, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		// if info.IsDir() && strings.Contains(path, "node_modules") {
		// 	return filepath.SkipDir
		// }

		if info.IsDir() {
			return watcher.Add(path)
		}

		return nil
	})

	return err
}
