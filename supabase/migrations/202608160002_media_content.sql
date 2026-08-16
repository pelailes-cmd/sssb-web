begin;

-- Adds the Media and Content collection.
--
-- Media records live in the existing content_items table, so they inherit the row-level security
-- already in place: visitors can read published rows and nothing else, and only administrators can
-- insert, update or delete. No new table, endpoint or policy is needed.
--
-- content_collections carries a hard-coded list of permitted collection names, and content_items
-- references it, so the list has to be widened before the first media record can be saved.

alter table public.content_collections
  drop constraint if exists content_collections_content_type_check;

alter table public.content_collections
  add constraint content_collections_content_type_check
  check (
    content_type in (
      'products',
      'promotions',
      'portfolio',
      'services',
      'documents',
      'media',
      'about'
    )
  );

commit;
