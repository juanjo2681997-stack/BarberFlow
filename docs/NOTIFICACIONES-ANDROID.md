# FlowBarber: notificaciones Android pendientes de activación

## Estado y alcance

Código preparado el 19 de octubre de 2026 sobre el repositorio local real
`C:\Proyectos\BarberFlow`. No se ha publicado la web, aplicado SQL remoto,
enviado nada a GitHub ni generado un APK/AAB nuevo.

El Android se ha recuperado de la entrega verificada del icono FB del 16 de
octubre, porque el repositorio web local no contenía Android. Se conserva
`app.flowreservas.flowbarber`, versionCode 2/versionName 1.1, URL del servidor,
recursos FB y configuración de firma. No incrementar la versión ni generar
release hasta revisar el conjunto. No usar la copia antigua de C:\FlowBarber:
esa copia todavía identifica la aplicación como `com.flowbarber.app`.

Las claves y la firma originales siguen en sus ubicaciones privadas. No se
incluyen en esta entrega ni deben añadirse a Git. Para una futura release,
reutilizar la misma keystore y su `android/key.properties` privado.
El certificado de subida de la entrega previa tiene SHA-256
`D7:34:AD:FE:90:3C:45:8F:59:F5:A0:D9:C9:E0:27:4E:4C:A6:19:F4:B9:FC:9E:6D:15:5C:66:AB:93:70:57:A1`.

## Comportamiento

- Agenda: dos columnas para las acciones y los estados; WhatsApp ocupa la
  fila completa. El bloque de botones ocupa todo el ancho de la tarjeta,
  por debajo de la hora y los datos. Altura mínima de 44 px y texto ajustable.
- Android usa Capacitor Push Notifications, no PushManager del navegador.
- El registro necesita sesión Supabase verificada. Cada instalación se
  asocia a un usuario; un cambio de cuenta o token reemplaza la asociación.
  Al salir se desregistra FCM, se borran avisos visibles y se elimina el token.
- El permiso se pide pulsando «Activar avisos de mis citas» en Mi perfil o
  el botón de avisos tras reservar. Al abrir/reanudar la app se registra
  automáticamente si el permiso ya estaba concedido.
- Una instalación antigua sin el plugin muestra que necesita la próxima
  actualización Android. Desplegar sólo la web no incorpora el plugin nativo.
- Confirmación, modificación de fecha/hora/servicio y cancelación se guardan
  mediante trigger en la misma transacción que la cita. Esto cubre también
  cambios masivos por bloqueo/horarios y eliminaciones directas.
- Eliminar una cita activa genera un aviso de cancelación con sus datos.
  Cancelar dos veces no duplica el aviso.
- Las cancelaciones del cliente también avisan a owners/managers activos
  registrados en Android. Se comprueba la pertenencia antes de enviar.
- El recordatorio se calcula como instante de la cita en Europe/Madrid menos
  24 horas reales, incluyendo los cambios de horario de verano/invierno.
  Si se reserva o mueve a menos de 24 horas, se envía confirmación/modificación
  y se omite el recordatorio tardío.
- Cualquier cambio relevante invalida trabajos anteriores. Una cita cancelada,
  eliminada, realizada o con no asistencia no mantiene recordatorios pendientes.
  Volver a Pendiente sincroniza ambos campos de estado y programa de nuevo.
- «Mis citas» conserva las canceladas futuras con su estado; recarga al recibir
  push, volver a la app y recuperar foco. Usa Realtime y, como respaldo, consulta
  cada 30 segundos mientras la página está visible. Una respuesta antigua o de
  otra sesión no sobrescribe la lista actual. Al tocar el aviso se abre Mi perfil,
  donde está Mis citas; los avisos al barbero abren el panel.

## Firebase y Android

1. Usar o crear el proyecto Firebase de FlowBarber. Registrar la aplicación
   Android con package ID EXACTO `app.flowreservas.flowbarber`.
2. Habilitar Firebase Cloud Messaging HTTP v1. Descargar el
   `google-services.json` de esa aplicación y guardarlo únicamente en
   `android/app/google-services.json`, que está ignorado por Git.
3. Crear una cuenta de servicio con permiso de envío de FCM
   (`roles/firebasecloudmessaging.admin`) para ese proyecto.
4. Guardar en el servidor Next.js, como secretos del entorno:

   | Variable | Contenido |
   | --- | --- |
   | FCM_PROJECT_ID | ID del proyecto Firebase |
   | FCM_CLIENT_EMAIL | client_email de la cuenta de servicio |
   | FCM_PRIVATE_KEY | private_key PEM; admite saltos reales o secuencias \\n |
   | NATIVE_PUSH_DISPATCH_SECRET | Secreto aleatorio exclusivo de este worker |
   | NEXT_PUBLIC_SUPABASE_URL | URL actual, sin cambiar de proyecto |
   | SUPABASE_SERVICE_ROLE_KEY | Clave privada actual, sólo servidor |

   Las variables FCM y de servicio NO llevan prefijo NEXT_PUBLIC_.
   No pegar claves en código, SQL versionado, conversaciones ni capturas.
5. Ejecutar `pnpm install --frozen-lockfile` y `pnpm android:sync`.
   Android 13+ pide permiso; Android 8+ usa el canal `appointments`.
   El icono de notificación es una silueta blanca FB independiente del launcher.
   Los avisos se muestran también con la app en primer plano.
6. La firma usa la configuración original. Este trabajo no genera ni sube
   ninguna release. Para revisar push instalado hará falta autorizar después
   una compilación de pruebas y disponer de un Android con Google Play Services.

Documentación oficial:
[Capacitor Push Notifications](https://capacitorjs.com/docs/apis/push-notifications),
[FCM HTTP v1](https://firebase.google.com/docs/cloud-messaging/send/v1-api).

## Supabase: aplicar primero en pruebas

1. Revisar y ejecutar `supabase/migrations/202610190001_native_notifications.sql`
   sobre una copia de pruebas con el esquema real. La migración es transaccional
   y se aplica una sola vez. Depende de las tablas existentes appointments,
   business_settings, business_users, employees y auth.users. No modifica sus RLS.
2. Crea native_push_devices y appointment_notification_jobs con RLS habilitado
   y sin acceso para anon/authenticated; solamente el servidor puede gestionarlas.
   Añade notification_revision a appointments y triggers para la cola.
   Las funciones RPC se restringen a service_role. Los clientes nunca eligen
   el propietario de un token ni el destinatario de un aviso.
3. Prepara recordatorios de citas existentes que estén a más de 24 h.
   No envía confirmaciones históricas.
4. Si se desea Realtime inmediato, habilitar appointments en la publicación
   `supabase_realtime` desde Database > Replication, conservando las políticas
   que permitan a cada cliente leer sólo sus citas. El refresco por foco/push
   y cada 30 s funciona aunque la publicación no esté habilitada.
5. Desplegar la versión web con los secretos del worker en el entorno de pruebas.
   La ruta `POST /api/push/dispatch` exige
   `Authorization: Bearer <NATIVE_PUSH_DISPATCH_SECRET>`. No confía en User-Agent.
6. En Supabase Vault crear dos secretos desde el dashboard:

   | Nombre | Valor |
   | --- | --- |
   | native_push_dispatch_url | URL HTTPS de pruebas + /api/push/dispatch |
   | native_push_dispatch_secret | Mismo valor de NATIVE_PUSH_DISPATCH_SECRET del servidor |

   No añadir valores reales a los archivos SQL.
7. Revisar/aplicar `supabase/native_push_scheduler.sql`. Habilita pg_net y
   pg_cron, invoca el worker al insertar un aviso inmediato y revisa la cola
   cada minuto para recordatorios/reintentos. Las solicitudes pg_net salen al
   confirmar la transacción. El trigger inmediato se instala sobre la cola,
   no como una llamada HTTP desde el móvil.
8. No requiere una Edge Function adicional: el worker protegido vive en Next.js;
   Supabase se encarga de la transacción, la cola, Vault y cron. Esto evita
   duplicar secretos y lógica de envío entre dos servidores.
9. Para pausar envíos sin perder la cola:

   ```sql
   select cron.unschedule('flowbarber-native-notifications');
   drop trigger if exists wake_native_notifications on public.appointment_notification_jobs;
   ```

   Restaurar aplicando de nuevo native_push_scheduler.sql. No deshabilitar los
   triggers de appointments si se quiere conservar el registro de cambios.

## Entrega, reintentos y límites

Los trabajadores reclaman lotes con FOR UPDATE SKIP LOCKED, lease de 2 minutos
y revisión de estado/versión antes de cada dispositivo. Guardan los dispositivos
ya enviados, eliminan tokens UNREGISTERED y reintentan fallos con espera creciente
hasta 8 intentos. El lote de 5 y el presupuesto de tiempo limitan el trabajo de
una invocación; ajustar con pruebas de carga si aumenta el volumen.

FCM recibe TTL 0: entrega inmediata al dispositivo conectado, sin almacenar
mensajes para entregarlos al reconectar con datos antiguos. El tag/collapse key
es el ID de la cita. Esto prioriza evitar avisos obsoletos; un dispositivo sin
conexión puede no recibir ese aviso. Al abrir la app consulta la cita vigente.
Consultar [duración de mensajes FCM](https://firebase.google.com/docs/cloud-messaging/customize-messages/setting-message-lifespan).

No existe garantía de exactamente una entrega entre PostgreSQL y FCM: un corte
después de que FCM acepte y antes de registrar el resultado puede repetir un
envío; un cambio que coincida con la llamada de red puede cruzarse con ella.
La cola invalida los pendientes, el tag agrupa avisos por cita y TTL 0 evita
acumulación offline. Un aviso ya mostrado por Android no puede retirarse de
forma remota con esta integración. «Mis citas» siempre vuelve a leer el servidor.

«Sent» significa aceptado por FCM, no leído por el cliente. No se registran tokens
ni claves en los errores. Revisar jobs.state, attempts y last_error con acceso
administrativo; alertar sobre failed y colas antiguas. La cola conserva snapshots
de servicio/fecha: definir retención operativa antes de activar producción.
Eliminar la cuenta auth borra dispositivos y trabajos asociados por cascada.

El envío web previo sigue disponible en navegadores compatibles. Ahora excluye
citas canceladas/realizadas/no asistidas y requiere el secreto de cron; los
triggers reinician/anulan también su estado de recordatorio. El cron web anterior
sigue siendo diario. No activar dos registros en el mismo dispositivo si no se
quieren avisos por ambos canales. Configurar CRON_SECRET para el cron Vercel
existente; ya no se admite autenticación mediante User-Agent.

## Pruebas de aceptación antes de publicar

- Registro con permiso aceptado/denegado, reinstalación, rotación de token,
  cierre de sesión y cambio de cuenta, sin avisos de otra cuenta.
- Dos dispositivos del mismo cliente; uno desconectado o desinstalado.
- Cancelación individual, por bloqueo, por cambio de horario y eliminación.
- Modificación independiente de hora, fecha y servicio; nuevos datos visibles.
- Tocar aviso con app abierta, en segundo plano y cerrada.
- Recordatorio a 24 h con hora de Madrid; cambios de horario de verano/invierno.
- Cancelar/mover una cita con recordatorio pendiente y comprobar que el viejo
  trabajo queda cancelled y sólo queda el nuevo.
- Realizada, No asistió y vuelta a Pendiente; lista de cliente coherente.
- Reintentos con FCM caído y dos trabajadores simultáneos.
- Agenda a 280, 320, 360 y 390 px, con texto ampliado y nombres largos.
- Confirmar que Supabase y Stripe siguen apuntando a su entorno actual de test.

Comprobaciones locales:

```powershell
pnpm test:notifications
pnpm exec tsc --noEmit
pnpm build
pnpm android:sync
cd android
.\gradlew.bat :app:compileDebugJavaWithJavac :app:lintDebug
```

El build web de validación usa variables públicas ficticias; no contacta con el
Supabase real. FCM se prueba con HTTP simulado y una clave RSA creada en memoria.
Los triggers se ejecutan en PostgreSQL embebido, sin modificar producción.

En esta máquina pnpm creó un marcador vacío res/.gitkeep como ReparsePoint.
Gradle lo rechazó al inspeccionar recursos del plugin. Se retiró únicamente
ese marcador de node_modules para la comprobación local; no se modificó el
código de la dependencia ni se incluye ese ajuste en Git.
