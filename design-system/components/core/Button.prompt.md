The action control. Gradient `primary` for the one thing you want clicked, `outline` for the secondary path, `github` for repo and external-code links.

```jsx
<Button icon={<i className="fa-brands fa-chrome" />}>Get Started</Button>
<Button variant="outline" icon={<i className="fa-solid fa-play" />}>See it in Action</Button>
<Button variant="github" size="sm" icon={<i className="fa-brands fa-github" />}>GitHub</Button>
```

One primary per view. All variants lift 2px on hover; primary also deepens its orange glow. `size="sm"` is for nav bars and card footers.
