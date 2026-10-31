"use client";

import { useRef, useState } from "react";
import { Camera, Check, LockKeyhole, Music2 } from "lucide-react";
import { type Actor } from "@/lib/protocol";
import { parseGitHubProfile, parseProfileMusic, validProfileAvatar, type GitHubProfile } from "@/lib/github-models";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { avatarImage } from "@/lib/avatar-image";

export const PROFILE_COLORS = ["#d45246", "#f68136", "#6c61df", "#46ba43", "#5caffa", "#408acf", "#d95574"];
export function ProfileCard({ actor, profile }: { actor: Actor; profile: GitHubProfile }) {
  const avatar = validProfileAvatar(profile.avatar) ? profile.avatar : actor.avatar?.startsWith("https://avatars.githubusercontent.com/") ? actor.avatar : undefined;
  return <div className="profile-card"><span className="profile-avatar" style={{ background: profile.color }}>{avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer" /> : (profile.name || actor.login).slice(0, 2).toUpperCase()}</span><h3>{profile.name || actor.login}</h3><p>@{actor.login}</p>{profile.bio && <p className="profile-bio">{profile.bio}</p>}</div>;
}
export function ProfileSettings({ actor, profile, published = false, onSave }: { actor: Actor; profile: GitHubProfile; published?: boolean; onSave: (profile: GitHubProfile) => Promise<void> | void }) {
  const [draft, setDraft] = useState(profile);
  const [confirmed, setConfirmed] = useState(published); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const file = useRef<HTMLInputElement>(null);
  async function photo(image: File) {
    try { setError(""); const avatar = await avatarImage(image); setDraft(previous => ({ ...previous, avatar }));
    } catch (error) { setError((error as Error).message); }
  }
  return <form className="profile-form" onSubmit={async event => { event.preventDefault(); if (busy || !confirmed) return; if ((draft.music?.title || draft.music?.url || draft.music?.artist) && !parseProfileMusic(draft.music)) { setError("Add a track title and a valid HTTPS music link, or clear the music fields."); return; } setBusy(true); setError(""); try { await onSave(parseGitHubProfile(draft)); } catch (error) { setError((error as Error).message); } finally { setBusy(false); } }}>
    <div className="profile-photo-editor"><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden ref={file} onChange={event => { const image = event.target.files?.[0]; event.target.value = ""; if (image) void photo(image); }} /><button className="profile-photo-button" type="button" aria-label="Change profile photo" onClick={() => file.current?.click()}>{(draft.avatar || actor.avatar?.startsWith("https://avatars.githubusercontent.com/")) && <img src={draft.avatar || actor.avatar} alt="" referrerPolicy="no-referrer" />}<Camera /></button>{draft.avatar && <button type="button" className="profile-remove-photo" onClick={() => setDraft(({ avatar: _avatar, ...previous }) => previous)}>Use GitHub avatar</button>}</div>
    <label className="profile-field outlined-field"><span className="field-caption">Display name</span><Input maxLength={64} value={draft.name} placeholder={actor.login} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
    <label className="profile-field outlined-field"><span className="field-caption">Bio</span><Input maxLength={160} value={draft.bio} placeholder="A little about you" onChange={event => setDraft({ ...draft, bio: event.target.value })} /></label>
    <label className="profile-field outlined-field"><span className="field-caption">Username</span><Input aria-label="GitHub username" value={`@${actor.login}`} readOnly /><small><LockKeyhole size={12} />Your GitHub username. Change it on GitHub, not here.</small></label>
    <fieldset className="profile-colors"><legend>Profile color</legend>{PROFILE_COLORS.map(color => <button type="button" key={color} aria-label={`Profile color ${color}`} aria-pressed={draft.color === color} style={{ background: `linear-gradient(#fff -300%, ${color})` }} onClick={() => setDraft({ ...draft, color })}>{draft.color === color && <Check />}</button>)}</fieldset>
    <details className="profile-music-editor" open={draft.music ? true : undefined}><summary><Music2 />Music</summary><p className="notice">Add your favorite track as a link. Opens on its music service; gitmsg does not host or stream the song.</p>{([['title', 'Track title'], ['artist', 'Artist'], ['url', 'Music link (HTTPS)']] as const).map(([key, label]) => <label className="profile-field" key={key}>{label}<Input type={key === "url" ? "url" : "text"} maxLength={key === "url" ? 2000 : 100} value={draft.music?.[key] || ""} onChange={event => setDraft({ ...draft, music: { title: "", artist: "", url: "", ...draft.music, [key]: event.target.value } })} /></label>)}{draft.music && <button className="profile-remove-photo" type="button" onClick={() => setDraft(({ music: _music, ...profile }) => profile)}>Remove music</button>}</details>
    <label className="check-label"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Publish my name, bio, photo and music link in my public gitmsg-profile repository. Old versions remain in Git history. My GitHub username and message authorship do not change.</label>
    {error && <p className="notice error" role="alert">{error}</p>}
    <Button type="submit" className="profile-save" loading={busy} disabled={!confirmed || busy}><Check />Save profile to GitHub</Button>
  </form>;
}
