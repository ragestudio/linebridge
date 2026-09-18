{
	"targets": [
		{
			"target_name": "uws-wrapper-x64",
			"type": "none",
			"conditions": [
				[
					"target_arch=='x64'",
					{
						"type": "loadable_module"
					}
				]
			],
			"sources": [
				"./src/addon.cpp",
				"./uWebSockets/uSockets/src/bsd.c",
				"./uWebSockets/uSockets/src/context.c",
				"./uWebSockets/uSockets/src/loop.c",
				"./uWebSockets/uSockets/src/socket.c",
				"./uWebSockets/uSockets/src/udp.c",
				"./uWebSockets/uSockets/src/eventing/epoll_kqueue.c",
				"./uWebSockets/uSockets/src/eventing/gcd.c",
				"./uWebSockets/uSockets/src/eventing/libuv.c",
				"./uWebSockets/uSockets/src/crypto/openssl.c",
				"./uWebSockets/uSockets/src/crypto/sni_tree.cpp"
			],
			"product_dir": "./out",
			"include_dirs": [
				"<!@(node -p \"require('node-addon-api').include\")",
				"./libs",
				"./uWebSockets/src",
				"./uWebSockets/uSockets/src"
			],
			"defines": [
				"WIN32_LEAN_AND_MEAN",
				"UWS_WITH_PROXY",
				"UWS_REMOTE_ADDRESS_USERSPACE",
				"LIBUS_USE_LIBUV",
				"LIBUS_USE_OPENSSL"
			],
			"cflags!": ["-fno-exceptions"],
			"cflags_cc!": ["-fno-exceptions"],
			"cflags": [
				"-O3",
				"-march=native",
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
				"-O3",
				"-march=native",
				"-flto",
				"-fvisibility=hidden",
				"-fvisibility-inlines-hidden",
				"-fdata-sections",
				"-ffunction-sections",
				"-fno-rtti",
				"-fno-unwind-tables",
				"-fno-asynchronous-unwind-tables",
				"-fno-ident",
				"-fno-stack-protector",
				"-std=c++20"
			],
			"ldflags": [
				"-flto",
				"-Wl,--gc-sections",
				"-Wl,--strip-all",
				"-Wl,--as-needed",
				"-Wl,--build-id=none",
				"-Wl,--hash-style=gnu",
				"-static-libstdc++",
				"-static-libgcc"
			]
		},
		{
			"target_name": "uws-wrapper-arm64",
			"type": "none",
			"conditions": [
				[
					"target_arch=='arm64'",
					{
						"type": "loadable_module"
					}
				]
			],
			"sources": [
				"./src/addon.cpp",
				"./uWebSockets/uSockets/src/bsd.c",
				"./uWebSockets/uSockets/src/context.c",
				"./uWebSockets/uSockets/src/loop.c",
				"./uWebSockets/uSockets/src/socket.c",
				"./uWebSockets/uSockets/src/udp.c",
				"./uWebSockets/uSockets/src/eventing/epoll_kqueue.c",
				"./uWebSockets/uSockets/src/eventing/gcd.c",
				"./uWebSockets/uSockets/src/eventing/libuv.c",
				"./uWebSockets/uSockets/src/crypto/openssl.c",
				"./uWebSockets/uSockets/src/crypto/sni_tree.cpp"
			],
			"product_dir": "./out",
			"include_dirs": [
				"<!@(node -p \"require('node-addon-api').include\")",
				"./libs",
				"./uWebSockets/src",
				"./uWebSockets/uSockets/src"
			],
			"defines": [
				"WIN32_LEAN_AND_MEAN",
				"UWS_WITH_PROXY",
				"UWS_REMOTE_ADDRESS_USERSPACE",
				"LIBUS_USE_LIBUV",
				"LIBUS_USE_OPENSSL"
			],
			"cflags!": ["-fno-exceptions"],
			"cflags_cc!": ["-fno-exceptions"],
			"cflags": [
				"-O3",
				"-march=armv8-a",
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
				"-O3",
				"-march=armv8-a",
				"-flto",
				"-fvisibility=hidden",
				"-fvisibility-inlines-hidden",
				"-fdata-sections",
				"-ffunction-sections",
				"-fno-rtti",
				"-fno-unwind-tables",
				"-fno-asynchronous-unwind-tables",
				"-fno-ident",
				"-fno-stack-protector",
				"-std=c++20"
			],
			"ldflags": [
				"-flto",
				"-Wl,--gc-sections",
				"-Wl,--strip-all",
				"-Wl,--as-needed",
				"-Wl,--build-id=none",
				"-Wl,--hash-style=gnu",
				"-static-libstdc++",
				"-static-libgcc"
			]
		}
	]
}
