# Publicar el rediseño sin reinstalar OpoPlan

**OpoPlan ya está instalado. No ejecutes `INSTALL.sql`, no apliques de nuevo las migraciones iniciales y no borres tablas ni datos. Esta actualización no requiere modificar Supabase.**

Producción existente: <https://opoplan-marc.pages.dev>. Repositorio: <https://github.com/Marcitius/OpoPlan>.

La conexión permitió leer GitHub, pero rechazó crear la rama con `403 Resource not accessible by integration`. Por ello se entrega la rama local completa en un archivo Git bundle, además del código y un parche. No se ha creado una rama remota ni una Pull Request desde esta sesión. Tampoco se ha sustituido producción.

## Usar la rama entregada

El bundle contiene los commits reales del repositorio y la rama `redesign/professional-ui`; conserva como antecesor el commit publicado `2efd830f16fbcd856d5bda3de19ca92c61906bb5`.

Descomprime la entrega. En una terminal, dentro de una carpeta de trabajo, ejecuta:

```sh
git clone --branch redesign/professional-ui /ruta/OpoPlan-redesign.bundle OpoPlan
cd OpoPlan
git remote set-url origin https://github.com/Marcitius/OpoPlan.git
npm ci
npm run check
npm test
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
```

En Windows sustituye `/ruta/OpoPlan-redesign.bundle` por la ruta real, entre comillas si contiene espacios. Puedes abrir la carpeta resultante en GitHub Desktop y publicar **esta rama**, manteniendo `main`.

Para desarrollo local, copia `.env.example` a `.env.local` y completa únicamente la clave pública si deseas iniciar sesión contra tu proyecto. No añadas claves administrativas. Las pruebas automatizadas no necesitan credenciales del proyecto real.

Si ya tienes el repositorio clonado, puedes traer la rama del bundle:

```sh
git fetch /ruta/OpoPlan-redesign.bundle redesign/professional-ui
git switch --create redesign/professional-ui FETCH_HEAD
```

Si tu copia contiene cambios sin guardar, consérvalos antes de cambiar de rama. No fuerces ramas ni reemplaces archivos sobre una versión distinta sin revisar las diferencias.

## Alternativa sin bundle

El ZIP de código contiene la raíz completa del proyecto. Crea `redesign/professional-ui` a partir de `main` en GitHub o GitHub Desktop y copia el contenido de la carpeta `OpoPlan` sobre esa rama. La raíz debe contener `package.json`, `src`, `public`, `tests` y `supabase`, no el ZIP ni una carpeta adicional anidada. El paquete no contiene secretos ni `node_modules`.

También se entrega `OpoPlan-redesign.patch`, relativo al commit de base. Para aplicarlo sobre una copia limpia de esa versión:

```sh
git switch --create redesign/professional-ui
git apply --check /ruta/OpoPlan-redesign.patch
git apply /ruta/OpoPlan-redesign.patch
```

## Pull Request y vista previa

Después de verificar localmente:

```sh
git push --set-upstream origin redesign/professional-ui
```

Crea una Pull Request hacia `main`. El texto preparado está en [PULL_REQUEST.md](PULL_REQUEST.md). No hagas merge hasta revisar la vista previa y aprobar la actualización.

Cloudflare Pages ya está conectado al repositorio. Un push a una rama de preview habilitada generará un despliegue de esa rama. En Workers & Pages → OpoPlan → Deployments, abre la URL del despliegue cuyo branch sea `redesign/professional-ui`. Si no se crea, comprueba las opciones de ramas de preview del proyecto.

Conserva el comando `npm run build`, la salida `dist` y las variables públicas existentes. Si Preview no dispone de las variables que ya utiliza Production, configura esos mismos valores públicos en Preview; no reemplaces los de Production. No se incluye una compilación alternativa para sustituir directamente la aplicación actual.

La preview comparte Supabase si se configuran las mismas variables. Usa una cuenta dedicada para crear registros de prueba. Iniciar sesión y consultar el temario real permite revisar la interfaz sin crear sesiones de estudio. Confirmación por email y recuperación de contraseña necesitan que Supabase permita la URL exacta de preview si quieres probar esos enlaces desde allí.

## Revisión antes del merge

Abre la preview en Safari del iPhone y en escritorio. Revisa Hoy, tu temario real, un bloque, repasos, cronómetro, formularios y tema oscuro. Las pruebas locales emulan tamaños de pantalla y no sustituyen esta comprobación física.

Cuando apruebes la actualización, haz merge de la Pull Request. Cloudflare compilará `main` con las variables existentes. Abre OpoPlan con conexión para que el service worker descargue los nuevos archivos y acepta la actualización cuando aparezca el aviso. IndexedDB y la base de datos conservan sus esquemas e historial.

Para retirar una actualización problemática, utiliza Rollback al despliegue anterior en Cloudflare o revierte los commits de interfaz con otra Pull Request. No restaures ni reinicialices Supabase para revertir un cambio visual.
