#!/bin/bash
# Run as the agent user. Lines starting with BAD mean isolation is broken.
GW=$(ip route | awk '/^default/{print $3; exit}')
# your PC's Tailscale IP and name (pass them in: TAILNET_IP=100.x.y.z TAILNET_NAME=pc.tailnet.ts.net bash isolation-test.sh)
TAILNET_IP=${TAILNET_IP:-100.100.100.100}
TAILNET_NAME=${TAILNET_NAME:-example.ts.net}
must_fail() { local name="$1"; shift; if timeout 8 bash -c "$*" >/dev/null 2>&1; then echo "BAD  (reachable) $name"; else echo "ok   (blocked)   $name"; fi; }
must_work() { local name="$1"; shift; if timeout 20 bash -c "$*" >/dev/null 2>&1; then echo "ok   (works)     $name"; else echo "BAD  (broken)    $name"; fi; }
echo "whoami: $(id)"
must_fail "list /mnt/c"                 'ls /mnt/c/Users'
must_fail "mount C: drive"              'mkdir -p /tmp/x && mount -t drvfs C: /tmp/x'
must_fail "sudo"                        'sudo -n true'
must_fail "su root"                     'echo | su -c true root'
must_fail "run cmd.exe"                 '/mnt/c/Windows/System32/cmd.exe /c ver'
must_fail "interop socket"              'ls /run/WSL/'
must_fail "WSLg dir"                    'ls /mnt/wslg/ | grep -q .'
must_fail "write to /mnt/wsl (shared)"  'touch /mnt/wsl/agent-test'
must_fail "note server via localhost"   'curl -s -m5 http://127.0.0.1:8787/api/health'
must_fail "note server via gateway"     "curl -s -m5 http://$GW:8787/api/health"
must_fail "tailnet IP"                  "curl -sk -m5 https://$TAILNET_IP/api/health"
must_fail "tailnet name"                "curl -sk -m5 https://$TAILNET_NAME/api/health"
must_fail "LAN router"                  'curl -s -m5 http://192.168.1.1/'
must_work "DNS lookup"                  'getent hosts github.com'
must_work "HTTPS github.com"            'curl -sfI -m15 https://github.com'
must_work "pip download"                'cd /tmp && python3 -m pip download --no-deps -q -d /tmp/pd six'
