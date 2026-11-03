// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,
  // Copia estos dos valores desde Supabase > Connect > App Frameworks.
  // Usa la clave publishable (sb_publishable_...) o la legacy anon.
  supabaseUrl: 'https://qpdwugxghbdywlngdpxl.supabase.co',
  supabasePublishableKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwZHd1Z3hnaGJkeXdsbmdkcHhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM2NTI5MTEsImV4cCI6MjEwOTIyODkxMX0.LKg4RQ6iZZ-le_VJmfPxmpTLbVg1yaZP--XD4PuzSos',
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
