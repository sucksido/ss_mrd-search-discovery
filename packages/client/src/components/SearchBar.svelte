<script lang="ts">
  import type { SearchStore } from '../lib/search-store.svelte.js';
  import Icon from './Icon.svelte';

  let { store }: { store: SearchStore } = $props();

  let input = $state<HTMLInputElement | null>(null);

  function onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        store.moveSuggestion(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        store.moveSuggestion(-1);
        break;
      case 'Enter':
        if (store.suggestionsOpen && store.activeSuggestion >= 0) {
          event.preventDefault();
          store.chooseSuggestion(store.activeSuggestion);
        }
        break;
      case 'Escape':
        store.closeSuggestions();
        break;
      default:
        break;
    }
  }
</script>

<!-- WAI-ARIA combobox: the input owns the listbox and points at the active
     option, so a screen reader announces suggestions as they are highlighted. -->
<form
  class="search"
  role="search"
  onsubmit={(event) => { event.preventDefault(); store.submit(); }}
>
  <label class="visually-hidden" for="search-input">Search the catalog</label>
  <div class="field">
    <!-- Drawn from the shared Icon set rather than inline here, so the magnifier
         in the field and the one in the empty state are the same glyph. -->
    <span class="icon"><Icon name="search" size={15} /></span>
    <input
      id="search-input"
      bind:this={input}
      type="text"
      role="combobox"
      autocomplete="off"
      placeholder="Search the catalog"
      aria-expanded={store.suggestionsOpen}
      aria-controls="suggestion-list"
      aria-autocomplete="list"
      aria-activedescendant={store.activeSuggestion >= 0 ? `suggestion-${store.activeSuggestion}` : undefined}
      value={store.q}
      oninput={(event) => store.onQueryInput(event.currentTarget.value)}
      onkeydown={onKeydown}
      onblur={() => setTimeout(() => store.closeSuggestions(), 120)}
    />
    {#if store.q !== ''}
      <button type="button" class="clear" onclick={() => { store.clearQuery(); input?.focus(); }}>
        <span class="visually-hidden">Clear search</span>
        <span aria-hidden="true">×</span>
      </button>
    {/if}
  </div>
  <button type="submit" class="submit">Search</button>

  {#if store.suggestionsOpen}
    <ul id="suggestion-list" class="suggestions" role="listbox" aria-label="Search suggestions">
      {#each store.suggestions as suggestion, index (suggestion.id)}
        <li
          id="suggestion-{index}"
          role="option"
          aria-selected={index === store.activeSuggestion}
          class:active={index === store.activeSuggestion}
        >
          <button type="button" onmousedown={() => store.chooseSuggestion(index)}>
            <span class="name">{suggestion.name}</span>
            <span class="category">{suggestion.category}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</form>

<style>
  /* Capped well short of the results grid. A search field stretched to the full
     width of a two-column layout reads as an empty bar rather than as an
     invitation to type, and the suggestion popover inherits that width. */
  .search { position: relative; display: flex; gap: var(--space-2); max-width: 560px; }

  .field {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: 1;
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    padding: 0 var(--space-3);
  }
  .field:focus-within { border-color: var(--text); }

  .icon { display: flex; color: var(--text-dim); flex: none; }

  input {
    flex: 1;
    border: 0;
    background: transparent;
    padding: 7px 0;
    font-size: 0.875rem;
    min-width: 0;
  }
  input::placeholder { color: var(--text-dim); }
  input:focus { outline: none; }

  .clear {
    border: 0;
    background: none;
    color: var(--text-dim);
    font-size: 1rem;
    line-height: 1;
    padding: 0 2px;
    cursor: pointer;
  }
  .clear:hover { color: var(--text); }

  .submit {
    border: 1px solid var(--accent);
    background: var(--accent);
    color: var(--accent-contrast);
    font-size: 0.8125rem;
    font-weight: 550;
    padding: 0 var(--space-4);
    border-radius: var(--radius);
    cursor: pointer;
  }
  .submit:hover { filter: brightness(1.1); }

  .suggestions {
    position: absolute;
    top: calc(100% + 4px);
    left: 0; right: 0;
    z-index: 20;
    margin: 0; padding: var(--space-1) 0;
    list-style: none;
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    box-shadow: var(--shadow-popover);
    max-height: 300px;
    overflow-y: auto;
  }
  .suggestions button {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
    width: 100%;
    border: 0;
    background: transparent;
    text-align: left;
    padding: var(--space-2) var(--space-3);
    font-size: 0.8125rem;
    cursor: pointer;
  }
  li.active button, .suggestions button:hover { background: var(--surface-2); }
  .name { flex: 1; }
  .category { color: var(--text-dim); font-size: 0.75rem; }

  @media (max-width: 520px) {
    .submit { padding: 0 var(--space-3); }
  }
</style>
