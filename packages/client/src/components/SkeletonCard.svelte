<!-- Occupies the same box as the card it becomes, so nothing shifts when the
     real content lands. Hidden from assistive tech: the loading state is
     announced as text in the control bar instead. -->
<div class="skeleton" aria-hidden="true">
  <div class="row">
    <span class="block circle"></span>
    <span class="lines">
      <span class="block line w60"></span>
      <span class="block line w40"></span>
    </span>
  </div>
  <span class="block line w90"></span>
  <span class="block line w70"></span>
  <div class="row footer">
    <span class="block line w30"></span>
    <span class="block line w40"></span>
  </div>
</div>

<style>
  .skeleton {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    min-height: 186px;
  }
  .row { display: flex; gap: var(--space-3); align-items: center; }
  .footer { margin-top: auto; justify-content: space-between; }
  .lines { display: flex; flex-direction: column; gap: 6px; flex: 1; }
  .block {
    display: block;
    background: linear-gradient(90deg, var(--surface-2) 25%, var(--border) 37%, var(--surface-2) 63%);
    background-size: 400% 100%;
    animation: shimmer 1.4s ease infinite;
    border-radius: var(--radius-sm);
  }
  .circle { width: 34px; height: 34px; border-radius: 50%; }
  .line { height: 10px; }
  .w30 { width: 30%; } .w40 { width: 40%; } .w60 { width: 60%; }
  .w70 { width: 70%; } .w90 { width: 90%; }

  @keyframes shimmer {
    0% { background-position: 100% 50%; }
    100% { background-position: 0 50%; }
  }
</style>
