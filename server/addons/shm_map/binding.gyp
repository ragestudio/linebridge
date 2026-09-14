{
	"targets": [
		{
			"target_name": "shm_map",
			"sources": ["./main.cpp"],
			"cflags!": ["-fno-exceptions"],
			"cflags_cc!": ["-fno-exceptions"],
			"cflags": [
				"-Os",
				"-flto",
				"-fvisibility=hidden",
				"-fdata-sections",
				"-ffunction-sections",
				"-fno-rtti",
				"-fno-unwind-tables",
				"-fno-asynchronous-unwind-tables",
				"-fno-ident",
				"-fno-stack-protector"
			],
			"cflags_cc": [
				"-Os",
				"-flto",
				"-fvisibility=hidden",
				"-fvisibility-inlines-hidden",
				"-fdata-sections",
				"-ffunction-sections",
				"-fno-rtti",
				"-fno-unwind-tables",
				"-fno-asynchronous-unwind-tables",
				"-fno-ident",
				"-fno-stack-protector"
			],
			"ldflags": [
				"-flto",
				"-Wl,--gc-sections",
				"-Wl,--strip-all",
				"-Wl,--as-needed",
				"-Wl,--build-id=none",
				"-Wl,--hash-style=gnu"
			]
		}
	]
}
