<!-- Occupies the same box as the card it becomes, so nothing shifts when the
     real content lands. Hidden from assistive tech: the loading state is
     announced as text in the control bar instead. -->
<div class="skeleton" aria-hidden="true">
  <div class="head">
    <div class="block tile"></div>
    <div class="title">
      <span class="block line w60"></span>
      <span class="block line w40"></span>
    </div>
    <div class="money">
      <span class="block line w70"></span>
      <span class="block line w50"></span>
    </div>
  </div>
  <div class="description">
    <span class="block line w100"></span>
    <span class="block line w75"></span>
  </div>
  <div class="foot"><span class="block line w45"></span></div>
</div>

<style>
  /* Same card chrome, same padding and the same header grid token as
     ResultCard, so the placeholder occupies the box the real result lands in. */
  .skeleton {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: var(--space-4);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-card);
  }

  .head {
    display: grid;
    grid-template-columns: var(--row-grid);
    gap: var(--space-3);
    align-items: start;
  }
  .title { display: flex; flex-direction: column; gap: 7px; padding-top: 3px; }
  .money { display: flex; flex-direction: column; align-items: flex-end; gap: 7px; padding-top: 3px; }
  .description { display: flex; flex-direction: column; gap: 7px; margin: var(--space-3) 0; }
  .foot { margin-top: auto; padding-top: var(--space-3); border-top: 1px solid var(--border); }

  .block {
    display: block;
    background: linear-gradient(90deg, var(--surface-2) 25%, var(--border) 37%, var(--surface-2) 63%);
    background-size: 400% 100%;
    animation: shimmer 1.4s ease infinite;
    border-radius: var(--radius-sm);
  }
  .tile { width: 40px; height: 40px; }
  .line { height: 9px; }
  .w40 { width: 40%; } .w45 { width: 45%; } .w60 { width: 60%; }
  .w75 { width: 75%; } .w100 { width: 100%; }
  .money .w50 { width: 48px; } .money .w70 { width: 66px; }

  @keyframes shimmer {
    0% { background-position: 100% 50%; }
    100% { background-position: 0 50%; }
  }
</style>
