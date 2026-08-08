# InmoRed — Cómo poner esto a funcionar en la nube (sin programar)

Sigue estos pasos en orden. Ninguno requiere escribir código ni usar la
terminal: todo es crear cuentas gratis y hacer clic. Avísame en qué paso
quedaste y seguimos desde ahí.

---

## Paso 1 — Crear la base de datos en la nube (Supabase)

1. Entra a **https://supabase.com** y crea una cuenta gratis (puedes usar tu
   cuenta de Google).
2. Clic en **"New project"**.
   - Nombre: `inmored`
   - Contraseña de base de datos: elige una y **guárdala en un lugar seguro**
     (la vas a necesitar solo si algún día conectamos herramientas externas).
   - Región: elige la más cercana a Bolivia (por ejemplo "South America
     (São Paulo)").
3. Espera 1-2 minutos mientras Supabase prepara el proyecto.
4. En el menú de la izquierda, entra a **"SQL Editor"**.
5. Clic en **"New query"**, pega ahí todo el contenido del archivo
   `InmoRed_esquema_base_datos.sql` (que ya te generé antes) y presiona
   **"Run"**. Esto crea automáticamente todas las tablas.
6. En el menú de la izquierda, entra a **"Authentication" → "Users"**.
7. Clic en **"Add user"** y crea un usuario para ti (correo y contraseña).
   Repite esto para Cecilia y para Camila cuando quieras darles acceso.
   (Esto reemplaza, por ahora, el registro automático — como no tenemos
   servidor de correo todavía, los usuarios se crean manualmente aquí).
8. En el menú de la izquierda, entra a **"Project Settings" → "API"**.
   Vas a ver dos datos que necesitaremos en el Paso 3:
   - **Project URL**
   - **anon public key**

   Copia ambos a un documento de texto temporal, los usamos enseguida.

✅ Con esto, tu base de datos ya está viva en la nube, gratis.

---

## Paso 2 — Subir el código a GitHub (sin usar comandos)

1. Entra a **https://github.com** y crea una cuenta gratis.
2. Clic en el botón verde **"New"** (nuevo repositorio).
   - Nombre: `inmored-web`
   - Marca la opción **"Private"** (privado).
   - Clic en **"Create repository"**.
3. En la página del repositorio recién creado, busca el enlace
   **"uploading an existing file"** (o el botón "Add file" → "Upload files").
4. Arrastra ahí **todos los archivos y carpetas** del proyecto que te voy a
   entregar comprimidos en un `.zip` (descomprímelo primero en tu
   computadora, y arrastra el contenido, no el .zip).
5. Abajo, en "Commit changes", deja el mensaje por defecto y presiona
   **"Commit changes"**.

✅ Tu código ya está respaldado y listo para conectarse a Vercel.

---

## Paso 3 — Publicar el sitio (Vercel)

1. Entra a **https://vercel.com** y crea una cuenta gratis usando tu cuenta
   de GitHub (botón "Continue with GitHub").
2. Clic en **"Add New..." → "Project"**.
3. Busca y selecciona el repositorio `inmored-web` → **"Import"**.
4. Antes de darle a "Deploy", despliega la sección **"Environment
   Variables"** y agrega dos variables (los valores son los que copiaste
   en el Paso 1.8):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | (tu Project URL de Supabase) |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (tu anon public key de Supabase) |

5. Clic en **"Deploy"**. Espera 1-2 minutos.
6. Vercel te va a dar un link (algo como `inmored-web.vercel.app`). Ese es
   tu sitio en vivo.

✅ Listo: ya puedes entrar a ese link, iniciar sesión con el usuario que
creaste en el Paso 1.7, y vas a ver la lista de inmuebles (vacía por ahora,
porque todavía no cargamos ningún inmueble en la base de datos — eso lo
hacemos en el próximo módulo).

---

## ¿Y si necesito cambiar algo del código más adelante?

No hace falta que hagas nada técnico: cuando avancemos al siguiente módulo,
yo te doy los archivos nuevos o modificados, tú los subes a GitHub de la
misma forma (Paso 2.4), y Vercel actualiza el sitio solo, automáticamente,
en cuanto detecta el cambio.

---

## Dominio propio (opcional, más adelante)

Cuando quieras usar `www.inmored.com.bo` en vez de `inmored-web.vercel.app`,
compras el dominio (paso con costo, ~US$ 20-30/año para `.com.bo`) y lo
conectas en Vercel → Project → Settings → Domains. Ese paso lo hacemos
cuando tú digas.

<!-- Última verificación de migración a Claude Code: 2026-08-08 -->
