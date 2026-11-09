#!/bin/bash
# Run as root before every sandbox command. Idempotent.
# Locks the 'agent' user (uid 2001) out of the Windows host, the tailnet and the LAN.
AG=2001

# ---- DNS: /etc/resolv.conf is a symlink into /mnt/wsl, which gets hidden below; keep a static copy ----
if [ -L /etc/resolv.conf ] || ! grep -q '^nameserver' /etc/resolv.conf 2>/dev/null; then
  NSLINE=$(grep -h '^nameserver' /etc/resolv.conf /mnt/wsl/resolv.conf 2>/dev/null | head -1)
  rm -f /etc/resolv.conf
  echo "${NSLINE:-nameserver 10.255.255.254}" > /etc/resolv.conf
  chmod 644 /etc/resolv.conf
fi

# ---- network: only public internet for uid 2001 ----
NS=$(awk '/^nameserver/{print $2; exit}' /etc/resolv.conf)
GW=$(ip route | awk '/^default/{print $3; exit}')
rule() { iptables -C OUTPUT "$@" 2>/dev/null || iptables -A OUTPUT "$@"; }
# DNS to the WSL resolver is allowed (inserted first so it wins)
if [ -n "$NS" ]; then
  for p in udp tcp; do
    iptables -C OUTPUT -m owner --uid-owner $AG -d "$NS" -p $p --dport 53 -j ACCEPT 2>/dev/null \
      || iptables -I OUTPUT 1 -m owner --uid-owner $AG -d "$NS" -p $p --dport 53 -j ACCEPT
  done
fi
for net in 127.0.0.0/8 100.64.0.0/10 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 169.254.0.0/16 224.0.0.0/4 ${GW:+$GW/32}; do
  rule -m owner --uid-owner $AG -d "$net" -j REJECT
done
# IPv6: block everything for the agent
ip6tables -C OUTPUT -m owner --uid-owner $AG -j REJECT 2>/dev/null || ip6tables -A OUTPUT -m owner --uid-owner $AG -j REJECT 2>/dev/null

# ---- hide shared/host mounts ----
# (our cover mounts are tmpfs with size=4k; skip a path that already has one)
# NOTE: never cover /mnt/wsl or /usr/lib/wsl: they are shared by the whole WSL VM and covering them breaks every distro.
for d in /mnt/wslg /tmp/.X11-unix; do
  [ -e "$d" ] || continue
  findmnt -n -o FSTYPE,OPTIONS --mountpoint "$d" 2>/dev/null | grep -q 'tmpfs.*size=4k' && continue
  # these are shared mounts (peer group with the WSLg system distro): make them private first
  # so our cover does not propagate to other distros
  mountpoint -q "$d" && mount --make-rprivate "$d" 2>/dev/null
  mount -t tmpfs -o size=4k,mode=755 tmpfs "$d" 2>/dev/null || true
done
# any drvfs (Windows drive) mounts: unmount
for m in $(findmnt -rn -t 9p,drvfs -o TARGET 2>/dev/null); do umount -l "$m" 2>/dev/null || true; done
# no privilege-escalation binaries for the agent
for b in /usr/bin/sudo /usr/bin/su /usr/bin/pkexec /usr/bin/newgrp; do [ -e "$b" ] && chmod 4750 "$b" 2>/dev/null && chown root:root "$b"; done
# interop socket(s): root only
chmod 700 /run/WSL 2>/dev/null || true
exit 0
