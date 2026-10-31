"use client";
import { useEffect, useState } from "react";
import { MessageCircle, Music2 } from "lucide-react";
import { api } from "@/lib/client";
import type { Actor } from "@/lib/protocol";
import { DEFAULT_PROFILE } from "@/lib/view-preferences";
import type { GitHubProfile } from "@/lib/github-models";
import { ProfileCard } from "./profile-settings";
import { Button } from "./ui/button";

export function PersonProfile({ user, onStart }: { user: Actor; onStart: (user: Actor) => Promise<void> }) {
  const [profile, setProfile] = useState<GitHubProfile>(DEFAULT_PROFILE); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { let alive = true; api<{ profile: GitHubProfile }>(`/api/profile?${new URLSearchParams({ login: user.login })}`).then(result => { if (alive) setProfile(result.profile); }).catch(error => { if (alive) setError(error.message); }); return () => { alive = false; }; }, [user.login]);
  return <div className="person-profile"><ProfileCard actor={user} profile={profile} />{profile.music && <a className="info-row" href={profile.music.url} target="_blank" rel="noreferrer"><Music2 /><span>{profile.music.title}<small>{profile.music.artist || "Favorite music"}</small></span></a>}<p className="notice">Start a private GitHub-backed chat. This creates a repository in your account and sends @{user.login} a collaborator invitation. They must accept it to join.</p><Button loading={busy} disabled={busy} onClick={async () => { setBusy(true); setError(""); try { await onStart(user); } catch (error) { setError((error as Error).message); } finally { setBusy(false); } }}><MessageCircle />Start chat with @{user.login}</Button>{error && <p className="notice error" role="alert">{error}</p>}</div>;
}
