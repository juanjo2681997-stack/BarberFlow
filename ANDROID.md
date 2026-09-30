# FlowBarber para Android

La aplicacion Android usa Capacitor para mostrar la publicacion de produccion:

`https://barberflow-citas.vercel.app`

## Requisitos

- Node.js 22 o posterior.
- Android Studio 2025.2.1 o posterior.
- Android SDK 36.

## Sincronizar el proyecto

```powershell
pnpm install
pnpm android:sync
```

## Firma de publicacion

La clave de subida y `android/key.properties` son locales y no se guardan en
Git. El archivo `android/key.properties` debe tener este formato:

```properties
storeFile=upload-keystore.jks
storePassword=CONTRASENA_DEL_ALMACEN
keyAlias=flowbarber-upload
keyPassword=CONTRASENA_DE_LA_CLAVE
```

Guarda `upload-keystore.jks` dentro de `android/`. Conserva una copia segura de
la clave y de sus contrasenas: se necesitaran para futuras actualizaciones.

## Generar el App Bundle

```powershell
pnpm android:bundle
```

El resultado se crea en:

`android/app/build/outputs/bundle/release/app-release.aab`
