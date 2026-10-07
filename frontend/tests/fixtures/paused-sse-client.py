"""Disposable OS socket probe. Credentials arrive only over private stdin."""
import json
import socket
import sys

config = json.loads(sys.stdin.readline())
with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as client:
    client.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 4096)
    client.connect(("127.0.0.1", config["port"]))
    request = (
        f"GET /api/account/events HTTP/1.1\r\nHost: 127.0.0.1:{config['port']}\r\n"
        f"Authorization: Bearer {config['token']}\r\nConnection: close\r\n\r\n"
    )
    client.sendall(request.encode())
    header = b""
    while b"\r\n\r\n" not in header:
        part = client.recv(256)
        if not part:
            raise RuntimeError("HTTP stream closed before headers")
        header += part
    if not header.startswith(b"HTTP/1.1 200"):
        raise RuntimeError("HTTP stream handshake failed")
    print(json.dumps({"port": client.getsockname()[1], "receiveBuffer": client.getsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF)}), flush=True)
    # Stop all application reads while the real TCP receive window fills.
    if not sys.stdin.readline():
        raise RuntimeError("Probe owner exited without resume")
    client.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 1024 * 1024)
    total = 0
    buffer = header.partition(b"\r\n\r\n")[2]
    terminal = False
    protected_after_terminal = False
    post_revocation_topic = False
    while True:
        while b"\r\n" not in buffer:
            part = client.recv(65536)
            if not part:
                raise RuntimeError("Chunked response ended before terminator")
            buffer += part
        line, _, buffer = buffer.partition(b"\r\n")
        size = int(line.split(b";", 1)[0], 16)
        if size == 0:
            break
        while len(buffer) < size + 2:
            part = client.recv(65536)
            if not part:
                raise RuntimeError("Chunked frame incomplete")
            buffer += part
        body = buffer[:size]
        total += size
        protected_after_terminal = protected_after_terminal or (terminal and (b"event: invalidate" in body or b"event: reset" in body))
        post_revocation_topic = post_revocation_topic or b'"scan"' in body
        terminal = terminal or b"auth-expired" in body
        buffer = buffer[size + 2:]
    print(json.dumps({"bytes": total, "authExpired": terminal, "protectedAfterTerminal": protected_after_terminal, "postRevocationTopic": post_revocation_topic}), flush=True)
