# ocds-redflags

⚠️ **Este proyecto está deprecado.** 

Para una versión actualizada y mantenida con la misma funcionalidad, consulta [flagfetti-ecuador-ocds](https://github.com/Abrimos-info/flagfetti-ecuador-ocds).

---

Evaluador de documentos OCDS con banderas configurables, explicación narrativa de cada una de ellas en la [wiki de proyecto](https://github.com/ProjectPODER/OCDS_RedFlags/wiki#metodolog%C3%ADa-de-evaluaci%C3%B3n).

Esta es la version que se utilizó para el lanzamiento de https://www.todosloscontratos.mx [(commit 5e2fb7bbc29814d5f2ddb935ddf0138cc92ae2ce)](https://github.com/ProjectPODER/OCDS_RedFlags/commit/5e2fb7bbc29814d5f2ddb935ddf0138cc92ae2ce)

La documentación de banderas nodo aún no está completa. Si fuera de interés, se hará una nueva versión con mejor documentación y comentarios.

#### Modo de uso
##### Instalación
    npm install
##### Ejecución

    node index.js -d [BASE_DE_DATOS] -c [COLECCION_OCDS] -f [FLAG_FILE]

## Configuración de banderas
Cada regla lleva una categoría, un nombre, un tipo y parámetros del tipo.

##### Tipo: check-fields-bool

Descripción: verifica que los campos existan, tengan valor, y su valor no sea "---" o "null".

Parámetros:

fields: array de nombres de campo a verificar


##### Tipo: check-fields-inverse

Descripción: verifica que los campos NO existan o NO tengan valor.

Parámetros:

fields: array de nombres de campo a verificar


##### Tipo: check-schema-bool

Descripción: valida que el schema de todo el documento sea válido. Incluye los schemas de las extensiones.


##### Tipo: check-sections-bool

Descripción: Valida que cada una de las secciones principales de cada release y del compiledRelease contengan al menos un campo lleno. Si falla en algún caso, da false.


##### Tipo: date-difference-bool

Descripción: Calcula la diferencia en días entre las fechas

Parámetros:

fields.from fecha inicial que se resta de la siguiente

fields.to fecha final a la que se le resta la fecha inicial

difference.minimum: cantidad de días mínimos. si la resta es menor, da false.

difference.maximum: cantidad de días máximos. si la resta es mayor, da false.


##### Tipo: field-equality-bool

Descripción: Compara el valor de dos campos, si son diferentes da false.
Parámetros:

fields: array de campos a comparar.


##### Tipo: check-dates-bool

Descripción: Evalúa si las fechas de fields coinciden con las fechas de date. Si es así da false.

Parámetros:

fields: Array de campos a verificar.

dates: Array de fechas a verificar. TODO: Falta especificarlas mejor.


##### Tipo: check-field-value-bool

Descripción: Compara el valor de un campo a un conjunto de valores. Si coincide da false.

Parámetros:

fields: Array de campos a comprar.

values: Array de valores a comparar con el de los campos.


##### Tipo: check-url-field

Descripción: Chequea que el campo tenga una url

Parámetros:

fields: Array de campos a verificar


##### Tipo: comprensibility

Descripción: Aplica esta función: http://gitlab.rindecuentas.org/ivan/luigi_pipelines/blob/master/RedFlagsDocumentations.py#L263

Parámetros:

fields: Array de campos a verificar.


Cada campo de parámetros puede ser un array que soporta condiciones y operaciones.

### Condiciones
Si las condiciones se cumplen, se aplica el value de esa condición.
El campo es un array. Cada elemento es un objeto con las siguientes propiedades:
- conditions, que es un objeto con campos y valores. Cada valor puede ser un objeto con un miembro and u or, y dentro de ese miembro un array de valores posibles para el campo.
- value: el valor que toma el campo si se cumplen las condiciones

Si no se cumple ninguna de las condiciones, el campo queda sin valor. Si ningún campo tiene valor, la regla da false.

Ejemplo:

    "minimum": [
      {
        "conditions": {
          "country": "MX",
          "Tender.procurementMethodCaracterMxCnet": {
            "or": [
              "Nacional",
              "undefined"
            ]
          }
        },
        "value": 15
      }
    ]

### Operaciones
Sobre cada field se puede aplicar una opcieación, la operación se define como nombre:valor
El único nombre soportado es substr y el valor de esta operación es un array de parámetros, desde qué caracter y cuántos caracteres.


Ejemplo:

    {
      "value":"contract.amount.value",
      "operation": {
      "substr":[-5]
      }
    }
