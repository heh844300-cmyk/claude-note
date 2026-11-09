#!/bin/bash
# One-time root setup for the ClaudeSandbox WSL distro.
set -e
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq python3 python3-pip python3-venv pipx git curl wget ca-certificates build-essential nodejs npm iptables jq unzip >/dev/null
# uv (Python package manager) for all users
if ! command -v uv >/dev/null; then
  curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin INSTALLER_NO_MODIFY_PATH=1 sh >/dev/null
fi
# unprivileged agent user, no sudo
if ! id agent >/dev/null 2>&1; then
  useradd -m -u 2001 -s /bin/bash agent
fi
gpasswd -d agent sudo 2>/dev/null || true
rm -f /etc/sudoers.d/agent
mkdir -p /home/agent/work && chown -R agent:agent /home/agent
# remove the default 'ubuntu' user if the image created one
id ubuntu >/dev/null 2>&1 && userdel -r ubuntu 2>/dev/null || true

cat > /etc/wsl.conf <<'EOF'
[automount]
enabled=false
mountFsTab=false

[interop]
enabled=false
appendWindowsPath=false

[network]
generateResolvConf=false

[user]
default=agent

[boot]
systemd=false
EOF

install -m 700 -o root -g root /tmp/ensure-sandbox.sh /usr/local/sbin/ensure-sandbox.sh
echo "setup done: $(python3 --version), node $(node --version), uv $(uv --version)"
