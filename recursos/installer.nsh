; Sobrescribe la verificación de "app en ejecución" de electron-builder.
; Bajo Wine genera un falso positivo que impide instalar; en Windows real
; no es crítico (Windows ya bloquea binarios en uso al sobrescribirlos).
!macro customCheckAppRunning
!macroend
