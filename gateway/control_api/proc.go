package control_api

import (
	"os"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

type procUsage struct {
	CPUPercent  float64 `json:"cpu_percent"`
	MemoryBytes int64   `json:"memory_bytes"`
	Threads     int     `json:"threads"`
}

type cpuSample struct {
	ticks int64
	at    time.Time
}

type hostSample struct {
	total int64
	idle  int64
	at    time.Time
}

type procSampler struct {
	mutex sync.Mutex
	procs map[int]*cpuSample
	host  *hostSample
}

func newProcSampler() *procSampler {
	return &procSampler{procs: make(map[int]*cpuSample)}
}

// usage returns cpu, memory and thread usage of a process
// the cpu percentage is relative to one core
func (sampler *procSampler) usage(pid int) procUsage {
	if runtime.GOOS != "linux" || pid <= 0 {
		return procUsage{}
	}

	ticks, threads, memory, err := readProcStat(pid)

	if err != nil {
		return procUsage{}
	}

	now := time.Now()

	sampler.mutex.Lock()
	defer sampler.mutex.Unlock()

	usage := procUsage{MemoryBytes: memory, Threads: threads}

	if previous, ok := sampler.procs[pid]; ok {
		elapsed := now.Sub(previous.at).Seconds()

		if elapsed > 0 {
			usage.CPUPercent = float64(ticks-previous.ticks) / elapsed
		}
	}

	sampler.procs[pid] = &cpuSample{ticks: ticks, at: now}

	if len(sampler.procs) > 256 {
		sampler.prune(now)
	}

	return usage
}

// prune drops samples from processes that are no longer reported
func (sampler *procSampler) prune(now time.Time) {
	for pid, sample := range sampler.procs {
		if now.Sub(sample.at) > 2*time.Minute {
			delete(sampler.procs, pid)
		}
	}
}

func (sampler *procSampler) hostUsage() (cpuPercent float64, load1, load5, load15 float64, memTotal, memAvailable int64) {
	if runtime.GOOS != "linux" {
		return 0, 0, 0, 0, 0, 0
	}

	total, idle, err := readCPUTimes()

	if err == nil {
		now := time.Now()

		sampler.mutex.Lock()

		if sampler.host != nil {
			deltaTotal := total - sampler.host.total
			deltaIdle := idle - sampler.host.idle

			if deltaTotal > 0 {
				cpuPercent = float64(deltaTotal-deltaIdle) / float64(deltaTotal) * 100
			}
		}

		sampler.host = &hostSample{total: total, idle: idle, at: now}
		sampler.mutex.Unlock()
	}

	load1, load5, load15 = readLoadAverage()
	memTotal, memAvailable = readMemInfo()

	return cpuPercent, load1, load5, load15, memTotal, memAvailable
}

// readProcStat returns the cpu ticks, thread count and rss of a process
func readProcStat(pid int) (int64, int, int64, error) {
	data, err := os.ReadFile("/proc/" + strconv.Itoa(pid) + "/stat")

	if err != nil {
		return 0, 0, 0, err
	}

	// the comm field is wrapped in parentheses and may contain spaces
	content := string(data)
	closeIndex := strings.LastIndex(content, ")")

	if closeIndex < 0 || closeIndex+2 >= len(content) {
		return 0, 0, 0, os.ErrInvalid
	}

	fields := strings.Fields(content[closeIndex+2:])

	// field 3 is the state, so utime (14) is index 11, stime (15) index 12
	// num_threads (20) index 17 and rss (24) index 21
	if len(fields) < 22 {
		return 0, 0, 0, os.ErrInvalid
	}

	utime, _ := strconv.ParseInt(fields[11], 10, 64)
	stime, _ := strconv.ParseInt(fields[12], 10, 64)
	threads, _ := strconv.Atoi(fields[17])
	rssPages, _ := strconv.ParseInt(fields[21], 10, 64)

	return utime + stime, threads, rssPages * int64(os.Getpagesize()), nil
}

// readCPUTimes returns the aggregated cpu time and idle time of the host
func readCPUTimes() (int64, int64, error) {
	data, err := os.ReadFile("/proc/stat")

	if err != nil {
		return 0, 0, err
	}

	line := strings.SplitN(string(data), "\n", 2)[0]
	fields := strings.Fields(line)

	if len(fields) < 5 || fields[0] != "cpu" {
		return 0, 0, os.ErrInvalid
	}

	var total int64
	var idle int64

	for index, field := range fields[1:] {
		value, err := strconv.ParseInt(field, 10, 64)

		if err != nil {
			continue
		}

		total += value

		// idle and iowait
		if index == 3 || index == 4 {
			idle += value
		}
	}

	return total, idle, nil
}

func readLoadAverage() (float64, float64, float64) {
	data, err := os.ReadFile("/proc/loadavg")

	if err != nil {
		return 0, 0, 0
	}

	fields := strings.Fields(string(data))

	if len(fields) < 3 {
		return 0, 0, 0
	}

	load1, _ := strconv.ParseFloat(fields[0], 64)
	load5, _ := strconv.ParseFloat(fields[1], 64)
	load15, _ := strconv.ParseFloat(fields[2], 64)

	return load1, load5, load15
}

func readMemInfo() (int64, int64) {
	data, err := os.ReadFile("/proc/meminfo")

	if err != nil {
		return 0, 0
	}

	var total int64
	var available int64

	for _, line := range strings.Split(string(data), "\n") {
		fields := strings.Fields(line)

		if len(fields) < 2 {
			continue
		}

		value, err := strconv.ParseInt(fields[1], 10, 64)

		if err != nil {
			continue
		}

		switch fields[0] {
		case "MemTotal:":
			total = value * 1024
		case "MemAvailable:":
			available = value * 1024
		}
	}

	return total, available
}
