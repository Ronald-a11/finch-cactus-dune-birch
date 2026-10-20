/**
 * React binding for P2PRoom. Identity and room id are captured once on mount
 * so re-renders never tear the mesh down. Key the component to change room
 * or name. Peer id is kept in sessionStorage so a refresh keeps the same seat.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { P2PRoom, type PeerInfo } from "./p2p";

export interface UseP2PRoomOptions {
  room?: string;
  name?: string;
}

export interface P2PRoomHandle {
  selfId: string;
  room: string;
  peers: PeerInfo[];
  joined: boolean;
  broadcast: (data: unknown) => void;
  send: (data: unknown, peerId?: string) => void;
  onMessage: (
    fn: (from: string, data: unknown, channel: "state" | "reliable") => void,
  ) => () => void;
}

function defaultRoom(): string {
  if (typeof window === "undefined") return "room-ssr";
  return `room-${window.location.hostname.split(".")[0]}`.slice(0, 64);
}

function loadSelfId(room: string): string {
  const make = () => `p${Math.random().toString(36).slice(2, 10)}`;
  if (typeof sessionStorage === "undefined") return make();
  const key = `farline-peer:${room}`;
  const existing = sessionStorage.getItem(key);
  if (existing && /^[A-Za-z0-9_-]{1,64}$/.test(existing)) return existing;
  const id = make();
  sessionStorage.setItem(key, id);
  return id;
}

export function useP2PRoom(options: UseP2PRoomOptions = {}): P2PRoomHandle {
  const [selfId] = useState(() => loadSelfId(options.room ?? "lobby"));
  const [room] = useState(() => options.room ?? defaultRoom());
  const [name] = useState(() => options.name ?? "Guest");
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [joined, setJoined] = useState(false);
  const roomRef = useRef<P2PRoom | null>(null);
  const listeners = useRef(
    new Set<(from: string, data: unknown, channel: "state" | "reliable") => void>(),
  );

  useEffect(() => {
    const p2p = new P2PRoom({
      room,
      selfId,
      name,
      onPeersChanged: setPeers,
      onMessage: (from, data, channel) => {
        for (const fn of listeners.current) fn(from, data, channel);
      },
      onConnected: () => setJoined(true),
    });
    roomRef.current = p2p;
    void p2p.join();
    return () => {
      roomRef.current = null;
      p2p.close();
    };
  }, [room, selfId, name]);

  const broadcast = useCallback((data: unknown) => roomRef.current?.broadcast(data), []);
  const send = useCallback(
    (data: unknown, peerId?: string) => roomRef.current?.send(data, peerId),
    [],
  );
  const onMessage = useCallback(
    (fn: (from: string, data: unknown, channel: "state" | "reliable") => void) => {
      listeners.current.add(fn);
      return () => {
        listeners.current.delete(fn);
      };
    },
    [],
  );

  return { selfId, room, peers, joined, broadcast, send, onMessage };
}
