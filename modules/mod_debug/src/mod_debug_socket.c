/*
 * BennuIDE Debugger Hook Module for BennuGD2
 * Listens on TCP socket (default port 4711 or BGD_DEBUG_PORT)
 * Intercepts process execution and synchronizes with the IDE Debug Adapter (DAP).
 *
 * Copyright (C) 2026 Juan Luis Ramírez Tutor
 * License: MIT
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#pragma comment(lib, "ws2_32.lib")
typedef int socklen_t;
#else
#include <unistd.h>
#include <sys/types.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <fcntl.h>
#endif

#define DEFAULT_DEBUG_PORT 4711
#define MAX_BREAKPOINTS 256

typedef struct {
    char file[256];
    int line;
} Breakpoint;

static int server_fd = -1;
static int client_fd = -1;
static Breakpoint breakpoints[MAX_BREAKPOINTS];
static int breakpoint_count = 0;
static int step_mode = 0; // 0 = continue, 1 = step_over, 2 = step_in

static void init_socket(int port) {
#ifdef _WIN32
    WSADATA wsa;
    WSAStartup(MAKEWORD(2, 2), &wsa);
#endif

    server_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (server_fd < 0) return;

    int opt = 1;
    setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, (const char *)&opt, sizeof(opt));

    struct sockaddr_in address;
    address.sin_family = AF_INET;
    address.sin_addr.s_addr = INADDR_ANY;
    address.sin_port = htons(port);

    if (bind(server_fd, (struct sockaddr *)&address, sizeof(address)) < 0) {
        return;
    }

    if (listen(server_fd, 1) < 0) {
        return;
    }

    // Wait for IDE connection (non-blocking accept or initial block)
    struct sockaddr_in client_addr;
    socklen_t addr_len = sizeof(client_addr);
    client_fd = accept(server_fd, (struct sockaddr *)&client_addr, &addr_len);
}

void mod_debug_init(void) {
    const char *env_port = getenv("BGD_DEBUG_PORT");
    int port = env_port ? atoi(env_port) : DEFAULT_DEBUG_PORT;
    init_socket(port);
}

static int check_breakpoint(const char *file, int line) {
    for (int i = 0; i < breakpoint_count; i++) {
        if (breakpoints[i].line == line) {
            return 1;
        }
    }
    return 0;
}

static void process_incoming_commands(void) {
    if (client_fd < 0) return;

    char buffer[512];
    int bytes = recv(client_fd, buffer, sizeof(buffer) - 1, 0);
    if (bytes > 0) {
        buffer[bytes] = '\0';
        if (strncmp(buffer, "CONTINUE", 8) == 0) {
            step_mode = 0;
        } else if (strncmp(buffer, "STEP_OVER", 9) == 0) {
            step_mode = 1;
        } else if (strncmp(buffer, "STEP_IN", 7) == 0) {
            step_mode = 2;
        } else if (strncmp(buffer, "SET_BREAKPOINT:", 15) == 0) {
            char file[256];
            int line = 0;
            if (sscanf(buffer + 15, "%255[^:]:%d", file, &line) == 2 && breakpoint_count < MAX_BREAKPOINTS) {
                strncpy(breakpoints[breakpoint_count].file, file, 255);
                breakpoints[breakpoint_count].line = line;
                breakpoint_count++;
            }
        } else if (strncmp(buffer, "CLEAR_BREAKPOINTS", 17) == 0) {
            breakpoint_count = 0;
        }
    }
}

void mod_debug_on_instruction(const char *file, int line) {
    if (client_fd < 0) return;

    process_incoming_commands();

    if (step_mode > 0 || check_breakpoint(file, line)) {
        char notify[256];
        snprintf(notify, sizeof(notify), "STOPPED:breakpoint:%s:%d\n", file, line);
        send(client_fd, notify, strlen(notify), 0);

        // Block until continue / step command received from IDE
        while (1) {
            char cmd[256];
            int r = recv(client_fd, cmd, sizeof(cmd) - 1, 0);
            if (r <= 0) break;
            cmd[r] = '\0';

            if (strncmp(cmd, "CONTINUE", 8) == 0) {
                step_mode = 0;
                break;
            } else if (strncmp(cmd, "STEP_OVER", 9) == 0) {
                step_mode = 1;
                break;
            } else if (strncmp(cmd, "STEP_IN", 7) == 0) {
                step_mode = 2;
                break;
            } else if (strncmp(cmd, "QUIT", 4) == 0) {
                exit(0);
            }
        }
    }
}

void mod_debug_cleanup(void) {
    if (client_fd >= 0) {
#ifdef _WIN32
        closesocket(client_fd);
        closesocket(server_fd);
        WSACleanup();
#else
        close(client_fd);
        close(server_fd);
#endif
    }
}
