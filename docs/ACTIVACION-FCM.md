# Activación de Firebase y Supabase para FlowBarber

## Estado y orden

El respaldo inicial `c6ad2e0` y su integración con GitHub `9fa14a8` están en main.
El Android remoto antiguo usaba `com.flowbarber.app`; al integrarlo se conservó
el identificador definitivo `app.flowreservas.flowbarber`, el icono FB y la versión 2/1.1.
No generar AAB ni publicar en Play Console hasta confirmar los avisos en móvil.

La migración y la Edge Function se han validado localmente. La migración
202610190001 ya está aplicada mediante SQL Editor en sqhgrwinookhppxsyddw;
tablas, RLS y triggers verificados. No volver a ejecutarla. La Edge Function
native-push-dispatch está desplegada; secretos FCM, Vault y cron están activos.
Firebase es flowbarber-a5bb6 y su archivo Android ya está integrado para
app.flowreservas.flowbarber. Falta probar recepción en un Android físico.

La credencial original permanece en C:\FlowBarber-Privado con el nombre
flowbarber-a5bb6-firebase-adminsdk-fbsvc-9851192089.json. No se ha copiado al
repositorio. Los valores de envío se conservan en Edge Secrets y el secreto
del cron también en Vault, sin copia local adicional del nuevo secreto.

Se ha comprobado OAuth y FCM HTTP v1 con validate_only para confirmación,
modificación, cancelación y recordatorio: las cuatro solicitudes devuelven 200.
Esto valida permisos y formato, no acredita entrega en un teléfono.

El cron ejecuta la cola cada minuto y el trigger la despierta inmediatamente
para eventos vencidos. La petición lleva una firma HMAC con timestamp y nonce,
válida 60 segundos: pg_net no recibe el secreto permanente. La validación JWT
legacy está desactivada porque la función verifica esta autenticación propia.
Las invocaciones administrativas directas pueden usar Bearer con el secreto.
Las tablas internas pg_net son una restricción de plataforma y no se pueden
proteger con REVOKE/RLS por proyecto; evitar guardar claves permanentes en ellas.

No hay pasos manuales de configuración Supabase pendientes. Revisar logs y
appointment_notification_jobs al hacer las pruebas móviles. No repetir la
migración ni sustituir secretos por claves del móvil.

## 1. Firebase

1. Crear o usar el proyecto FlowBarber de la cuenta del usuario. Aceptar las
   condiciones debe hacerlo el usuario. No activar Analytics, Gemini o facturación
   para esta integración de mensajería.
2. Registrar una app Android cuyo package ID sea exactamente
   `app.flowreservas.flowbarber`. El nombre visible puede ser FlowBarber.
   Para FCM básico no es necesario añadir un certificado SHA.
3. Descargar `google-services.json` de esa app y guardarlo en
   `android/app/google-services.json`. Gradle rechaza un archivo de otro package.
   Conservar una copia privada. No contiene la clave privada del servidor, pero
   se mantiene fuera de Git siguiendo la política de este proyecto.
4. Comprobar que Firebase Cloud Messaging API HTTP v1 está habilitada.
5. Preparar una identidad de envío limitada al proyecto Firebase con el rol
   `roles/firebasecloudmessaging.admin`. Conservar en Supabase el `project_id`,
   `client_email` y `private_key` de esa identidad, nunca en Git ni en el chat.
   Evitar conceder Owner o Editor. No descargar una clave de servicio a outputs.
6. Guardar FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY y un secreto aleatorio
   NATIVE_PUSH_DISPATCH_SECRET en Edge Functions > Secrets. La clave PEM admite
   saltos reales o secuencias `\n`. No usar prefijos NEXT_PUBLIC_ para estos valores.

El usuario debe conservar acceso al proyecto, su ID y número, la app Android
registrada, una copia privada de google-services.json y la keystore original con
sus contraseñas y key.properties. La cuenta de envío y la clave deben permanecer
en gestores de secretos; si una clave se expone, revocarla y sustituirla allí.

## 2. Supabase, antes de habilitar envíos

1. Entrar en el proyecto al que apunta NEXT_PUBLIC_SUPABASE_URL. No crear otro
   proyecto ni modificar Stripe. Revisar el esquema real y disponer del respaldo
   habitual de la base de datos; la copia Git no respalda los datos.
2. Ejecutar `supabase/native_push_preflight.sql`, que sólo consulta estructura.
3. Probar y aplicar una sola vez
   `supabase/migrations/202610190001_native_notifications.sql` con SQL Editor o
   el procedimiento de migraciones existente. No ejecutar db push sobre una
   base con historial desconocido sin reconciliar primero ese historial.
4. Confirmar las tablas native_push_devices y appointment_notification_jobs,
   RLS, RPC limitadas a service_role y los triggers de appointments.
5. Desplegar desde la raíz del repositorio:

   ```powershell
   pnpm dlx supabase functions deploy native-push-dispatch --project-ref PROJECT_REF
   ```

   `supabase/config.toml` establece verify_jwt=false porque la función valida
   su propio secreto con comparación constante antes de consultar datos.
   SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son variables incorporadas por
   Supabase: no sustituirlas por valores de otro proyecto.
6. Sin credenciales o con credenciales incorrectas, POST debe responder 401;
   GET responde 405. Con secreto correcto y sin FCM configurado responde 503.
   Una respuesta 200 con processed=0 sólo confirma que la cola está vacía.
   No demuestra la recepción de una notificación.
7. En Vault, guardar native_push_dispatch_url con la URL HTTPS de la función
   y native_push_dispatch_secret con el mismo valor del secreto de Edge Functions.
   Vault y Edge Secrets son almacenes distintos. No escribir valores en SQL
   versionado ni pegar literales secretos en consultas que queden guardadas.
8. Cuando función, secretos y prueba controlada estén listos, aplicar
   `supabase/native_push_scheduler.sql`. Instala cron cada minuto y el despertar
   inmediato tras insertar una confirmación, modificación o cancelación.
9. Revisar el resultado del despliegue web automático del push a main: el registro
   de dispositivos necesita la ruta web /api/push/devices actualizada. Nunca
   enviar la clave de servicio ni las claves FCM al móvil.

Cron reclama lotes de 5 y reintenta fallos. Los recordatorios se calculan
24 horas reales antes de la cita en Europe/Madrid. La prueba de modificación o
cancelación debe dejar cancelado el recordatorio antiguo. Revisar pending,
processing, sent, cancelled y failed sin mostrar tokens en registros. Sent
significa aceptado por FCM, no leído ni necesariamente entregado al dispositivo.

## 3. Checklist de Android físico

La app instalada antes de esta integración no incorpora el nuevo plugin nativo.
Para probar hará falta una instalación de pruebas con este código y Firebase;
la compilación/instalación se realizará como siguiente paso autorizado, sin AAB.

- [ ] Dispositivo con Google Play Services y cuenta de cliente de pruebas.
- [ ] Confirmar package ID, icono FB y la firma original.
- [ ] Pulsar «Activar avisos de mis citas» y aceptar el permiso Android 13+.
- [ ] Denegar permiso y reactivarlo después desde Ajustes; mensajes coherentes.
- [ ] Confirmar un dispositivo registrado sin copiar su token a capturas o chat.
- [ ] Reservar a más de 24 h y recibir la confirmación.
- [ ] Mover fecha, hora y servicio; recibir nuevos datos y ver Mis citas actualizado.
- [ ] Cancelar desde barbero y desde cliente; el manager recibe su aviso cuando corresponda.
- [ ] Verificar que el recordatorio antiguo queda cancelled tras mover o cancelar.
- [ ] Crear cita de prueba a 24 h más unos minutos y comprobar el aviso al vencer.
- [ ] Reservar a menos de 24 h: confirmación sin recordatorio tardío duplicado.
- [ ] Probar primer plano, segundo plano y cierre normal; tocar aviso abre Mis citas.
- [ ] Probar sesión cerrada, cambio de cuenta y dos móviles sin avisos de otra cuenta.
- [ ] Probar sin conexión: TTL 0 evita entrega atrasada; al abrir se actualiza Mis citas.
- [ ] Probar realizada/no asistió, vuelta a pendiente y agenda con texto ampliado.
- [ ] Confirmar con el usuario la recepción real antes de preparar una release.

No usar «Forzar detención» para simular cierre normal: Android bloquea la
recepción hasta que se abre de nuevo la app. No cambiar fechas del teléfono
para simular el cron del servidor. Toda prueba de cola debe usar citas de prueba.

## Referencias oficiales

- https://firebase.google.com/docs/android/google-services-plugin-and-file
- https://firebase.google.com/docs/cloud-messaging/send/v1-api
- https://supabase.com/docs/guides/functions/dependencies
- https://supabase.com/docs/guides/functions/schedule-functions
