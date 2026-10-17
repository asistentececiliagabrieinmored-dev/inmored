-- InmoRed — Sección "Redes Sociales": banco de material (artes, fotos y copy)
-- que los asesores usan para armar sus publicaciones. Es independiente de la
-- tabla inmuebles: solo contiene lo que se carga desde esta sección.
-- (No confundir con la tabla publicaciones_redes, que ya existía y es otra cosa:
-- registro de en qué red se publicó un inmueble. Esa no se toca.)
--
-- Reglas:
--   * Todos los usuarios InmoRed pueden ver las publicaciones.
--   * Cualquier usuario InmoRed puede cargar una nueva (arranca como disponible).
--   * Solo quien la cargó y el gerente de operaciones pueden editarla.
--   * Solo el gerente de operaciones puede cambiar disponible / no disponible.
--
-- Para aplicarlo, pegar el contenido completo en el SQL Editor de Supabase y correrlo ahí.

-- ---------------------------------------------------------------------------
-- Funciones auxiliares para las políticas de seguridad
-- ---------------------------------------------------------------------------

-- id (tabla usuarios) del usuario conectado, o null si no está vinculado.
-- Lo identifica igual que es_usuario_inmored(): por auth_user_id o por email
-- (prioriza auth_user_id si ambos coinciden con filas distintas).
create function usuario_actual_id()
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.id
  from usuarios u
  where u.auth_user_id = auth.uid()
     or lower(trim(u.email)) = lower(trim(
          nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email'
        ))
  order by (u.auth_user_id = auth.uid()) desc nulls last
  limit 1;
$$;

-- true si el usuario conectado tiene rol gerente_operaciones.
create function es_gerente_operaciones()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from usuarios u
    join roles r on r.id = u.rol_id
    where u.id = usuario_actual_id()
      and r.nombre = 'gerente_operaciones'
  );
$$;

-- ---------------------------------------------------------------------------
-- Publicaciones
-- ---------------------------------------------------------------------------

create table material_redes (
  id bigint generated always as identity primary key,
  nombre text not null,
  tipo_transaccion_id bigint references tipos_transaccion(id),
  tipo_inmueble_id bigint references tipos_inmueble(id),
  zona_id bigint references zonas(id),
  moneda text not null default 'usd' check (moneda in ('usd', 'bob')),
  precio numeric,
  copy text,
  disponible boolean not null default true,
  cargado_por_usuario_id integer not null default usuario_actual_id() references usuarios(id),
  fecha_creacion timestamptz not null default now(),
  fecha_actualizacion timestamptz not null default now()
);

create index material_redes_listado_idx
  on material_redes (disponible desc, fecha_creacion desc);

alter table material_redes enable row level security;

create policy "Usuarios InmoRed pueden leer material de redes"
  on material_redes for select
  using (es_usuario_inmored());

-- Al crear, queda a nombre de quien la carga y siempre como disponible.
create policy "Usuarios InmoRed pueden crear material de redes"
  on material_redes for insert
  with check (
    es_usuario_inmored()
    and cargado_por_usuario_id = usuario_actual_id()
    and disponible = true
  );

create policy "Autor o gerente pueden editar material de redes"
  on material_redes for update
  using (cargado_por_usuario_id = usuario_actual_id() or es_gerente_operaciones())
  with check (cargado_por_usuario_id = usuario_actual_id() or es_gerente_operaciones());

-- Las políticas no pueden comparar el valor viejo con el nuevo, así que el
-- control de "solo el gerente cambia el estado" y "no se cambia el autor"
-- se hace con un trigger.
create or replace function material_redes_antes_de_actualizar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.disponible is distinct from old.disponible and not es_gerente_operaciones() then
    raise exception 'Solo el gerente de operaciones puede cambiar el estado de disponibilidad.';
  end if;

  if new.cargado_por_usuario_id is distinct from old.cargado_por_usuario_id then
    raise exception 'No se puede cambiar quién cargó la publicación.';
  end if;

  new.fecha_actualizacion := now();
  return new;
end;
$$;

create trigger trg_material_redes_antes_de_actualizar
  before update on material_redes
  for each row execute function material_redes_antes_de_actualizar();

-- ---------------------------------------------------------------------------
-- Imágenes del carrusel (artes y fotografías)
-- ---------------------------------------------------------------------------
-- Se guardan en el bucket PÚBLICO "documentos" (material de marketing, sin
-- datos sensibles). Se guarda la URL pública para mostrarla y la ruta del
-- storage para poder borrar el archivo si se quita del carrusel.

create table material_redes_imagenes (
  id bigint generated always as identity primary key,
  material_id bigint not null references material_redes(id) on delete cascade,
  tipo text not null check (tipo in ('arte', 'foto')),
  url text not null,
  ruta_storage text not null,
  orden integer not null default 0,
  fecha_carga timestamptz not null default now()
);

create index material_redes_imagenes_material_idx
  on material_redes_imagenes (material_id, tipo, orden);

alter table material_redes_imagenes enable row level security;

create policy "Usuarios InmoRed pueden leer imágenes de material de redes"
  on material_redes_imagenes for select
  using (es_usuario_inmored());

-- Agregar, reordenar o quitar imágenes: mismas reglas que editar la publicación.
create policy "Autor o gerente pueden agregar imágenes de material de redes"
  on material_redes_imagenes for insert
  with check (exists (
    select 1 from material_redes p
    where p.id = material_id
      and (p.cargado_por_usuario_id = usuario_actual_id() or es_gerente_operaciones())
  ));

create policy "Autor o gerente pueden actualizar imágenes de material de redes"
  on material_redes_imagenes for update
  using (exists (
    select 1 from material_redes p
    where p.id = material_id
      and (p.cargado_por_usuario_id = usuario_actual_id() or es_gerente_operaciones())
  ));

create policy "Autor o gerente pueden quitar imágenes de material de redes"
  on material_redes_imagenes for delete
  using (exists (
    select 1 from material_redes p
    where p.id = material_id
      and (p.cargado_por_usuario_id = usuario_actual_id() or es_gerente_operaciones())
  ));

NOTIFY pgrst, 'reload schema';
