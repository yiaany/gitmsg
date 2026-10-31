"use client";
import { Github } from "./github-icon";
import { Button } from "./ui/button";

export function LoginScreen({ session, error, onRetry }: { session: { configured: boolean; mode: string } | null; error?: string; onRetry: () => void }) {
  return <main className="login-screen"><section className="login-card" lang="en">
    <header className="manifest-header">{session?.configured ? <Button className="login-submit" render={<a href="/api/auth/login" />}><Github size={18} />Sign in with GitHub</Button> : <Button className="login-submit" disabled><Github size={18} />{session ? "GitHub sign-in is not configured" : "Connecting…"}</Button>}</header>
    {error && <p className="login-error" role="alert">{error}<button type="button" onClick={onRetry}>Retry</button></p>}
    {session && !session.configured && <a className="login-setup" href="/setup">Configure GitHub sign-in</a>}
    <article className="login-manifest" aria-labelledby="manifest-title"><h1 id="manifest-title">Some things should exist just for the fun of it.</h1>
      <p>We turned GitHub into a messenger. Chats are repositories. Messages are commits. “I never said that” now comes with a <code>git log</code>. Not because the world needed another chat app — <strong>because we wanted to see if it would work.</strong></p>
      <p>No pitch deck. No grand plan to reinvent human connection. Just a weird idea, a familiar interface, and the unreasonable satisfaction of making them fit. <strong>Software can still be a playground.</strong></p>
      <p>Bring your GitHub account. Invite a friend. Send a photo, leave a voice note, react to something stupid. No fake conversations, no bot pretending to be your friend. <strong>Real people. Real messages. A little Git underneath.</strong></p>
      <p>No magic privacy claims, either. GitHub can read standard messages; public channels are public. Browser encryption is optional, and your keys are yours to keep. Deleting a message hides it from the chat — <strong>Git still remembers.</strong></p>
      <p>Not everything needs to become the next big thing. <strong>Sometimes “holy shit, it works” is enough.</strong></p>
      <p><a className="manifest-source" href="https://github.com/yiaany/gitmsg" target="_blank" rel="noopener noreferrer"><Github size={16} />View source on GitHub<span aria-hidden="true">↗</span></a></p>
    </article>
  </section></main>;
}
