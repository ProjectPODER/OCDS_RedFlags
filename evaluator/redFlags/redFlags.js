const ocdsSchema = require('./ocdsSchema');
const validUrl = require('valid-url');

function isEmpty(obj) {
    for(var key in obj) {
        if(obj.hasOwnProperty(key))
            return false;
    }
    return true;
}

function isObject(val) {
    if (val === null) { return false;}
    return ( (typeof val === 'function') || (typeof val === 'object') );
}

function isArray(obj) {
    return !!obj && obj.constructor === Array;
}

function isString(x) {
    return Object.prototype.toString.call(x) === "[object String]"
}

function isDate(d) {
    return typeof d.toISOString === "function";
}

// Parameters:
//      field: string separado por . del campo a buscar
//      tempObj: el contrato en el que se buscan los campos
// Return:
//      Array con el contenido del campo, o array vacío si no encontró el campo
function fieldPathExists(field, tempObj) {
    var fieldValues = [];
    var fieldPath = field.split('.');

    // Iterar sobre array con los componentes del campo
    for(var i=0; i<fieldPath.length; i++) {
        // Si el campo NO existe en el contrato
        if( typeof tempObj[fieldPath[i]] == 'undefined' ) {
            return fieldValues;
        }
        // Si el campo es null
        if(tempObj[fieldPath[i]] == null) {
            return fieldValues;
        }

        // Si el campo es un array
        if( isArray(tempObj[fieldPath[i]]) ) {
            if(i == fieldPath.length - 1) { // Estamos chequeando si existe el array, no su valor
                fieldValues.push(tempObj[fieldPath[i]]);
            }
            else if( tempObj[fieldPath[i]].length > 0 ) { // Iteramos sobre el array de campos
                tempObj[fieldPath[i]].map( (tempItem) => {
                    var results = fieldPathExists( fieldPath.slice(i+1, fieldPath.length).join('.'), tempItem );
                    fieldValues = fieldValues.concat(results);
                } );
            }
            return fieldValues;
        }

        // Si el valor del campo es un string
        else if( isString(tempObj[fieldPath[i]]) ) {
            if(i < fieldPath.length - 1) { // Llegó a un string pero no ha llegado al final del path
                return fieldValues;
            }
            if(tempObj[fieldPath[i]] == '' || tempObj[fieldPath[i]] == '---' || tempObj[fieldPath[i]] == 'null') { // Llegó a string vacío, '---' o 'null'
                return fieldValues;
            }
            fieldValues.push( tempObj[fieldPath[i]] );
            return fieldValues;
        }

        // Si el valor del campo es una fecha
        else if( isDate(tempObj[fieldPath[i]]) ) {
            if(i < fieldPath.length - 1) { // Si llegó a un date pero no ha llegado al final del path
                return fieldValues;
            }
            fieldValues.push(tempObj[fieldPath[i]].toISOString());
            return fieldValues;
        }

        // Si fieldPath[i] es un objeto
        else if( tempObj.hasOwnProperty(fieldPath[i]) && !isEmpty(tempObj[fieldPath[i]]) ) {
            tempObj = tempObj[fieldPath[i]];
        }

        // Ninguna de las anteriores...
        else {
            return fieldValues;
        }
    }

    fieldValues.push(tempObj);
    return fieldValues;
}

function makeUnique(arr){
    var uniqueArray=[];
    for(var i=0; i<arr.length; i++){
        if( !uniqueArray.includes(arr[i]) ){
            uniqueArray.push(arr[i]);
        }
    }
    return uniqueArray;
}

function evaluateConditions(contract, conditions, fieldName) {
    var fieldExists = [];

    Object.keys(conditions).map( (condition, index) => {
        switch(condition) {
            case 'or': // Chequear si alguno de los campos existe
                var or = conditions[condition].filter( (item) => {
                    var fieldvalue = fieldPathExists(item, contract);
                    return (fieldvalue.length > 0)? true : false;
                } );

                if(or.length > 0) { // Si se cumple alguna de las condiciones en el OR
                    fieldExists = fieldExists.concat(fieldPathExists(fieldName, contract));
                }
            default:
                var conditionField = Object.keys(conditions)[0];
                var conditionValue = conditions[conditionField];
                var foundValue = fieldPathExists( conditionField, contract );

                if(foundValue.length > 0) { // Hay al menos un resultado para el campo de la condición
                    foundValue.map( (result) => {
                        // Comparar los resultados obtenidos del contrato con el valor esperado de la condición
                        if(result == conditionValue) {
                            fieldExists = fieldExists.concat( fieldPathExists(fieldName, contract) );
                        }
                    } );
                }
        }
    } );

    return (fieldExists.length > 0)? true : false;
}

function evaluateDateCondition(contract, conditionType, condition, daysDifference) {
    var conditionMatches = false;

    Object.keys(condition).map( (field) => {
        var fieldValue = fieldPathExists(field, contract);
        if(fieldValue.length > 0) {
            fieldValue.map( (value) => {
                if(isString(condition[field])) {
                    if(condition[field] == value) {
                        switch(conditionType) {
                            case 'maximum':
                                if(daysDifference < condition.value) conditionMatches = true;
                                break;
                            case 'minimum':
                                if(daysDifference > condition.value) conditionMatches = true;
                                break;
                        }
                    }
                }
                else { // Si tiene un OR
                    condition[field].or.map( (orValue) => {
                        if(orValue == value) {
                            switch(conditionType) {
                                case 'maximum':
                                    if(daysDifference < condition.value) conditionMatches = true;
                                    break;
                                case 'minimum':
                                    if(daysDifference > condition.value) conditionMatches = true;
                                    break;
                            }

                        }
                    } );
                }
            } );
        }
    } );

    return conditionMatches;
}

// ---------- FLAG FUNCTIONS ----------

// Tipo: check-fields-bool
// Descripción: verifica que los campos existan, tengan valor, y su valor no sea "---" o "null".
// Parámetros:
//      fields: array de nombres de campo a verificar
function checkAllFieldsFlag() {
    return 0.5;
}

// Tipo: comprensibility
// Descripción: Aplica esta función: http://gitlab.rindecuentas.org/ivan/luigi_pipelines/blob/master/RedFlagsDocumentations.py#L263
// Parámetros:
//      fields: Array de campos a verificar.
function checkComprensibilityFlag() {
    return 0.5;
}

// Tipo: check-dates-bool
// Descripción: Evalúa si las fechas de fields coinciden con las fechas de date. Si es así da false.
// Parámetros:
//      contract: contrato a evaluar
//      fields: Array de campos a verificar.
//      dates: Array de fechas a verificar. TODO: Falta especificarlas mejor.
function checkDatesFlag() {
    return 0.5;
}

// Tipo: field-equality-bool
// Descripción: Compara el valor de dos campos, si son diferentes da false.
// Parámetros:
//      contract: contrato a evaluar
//      fields: array de campos a comparar.
function checkFieldsComparisonFlag(contract, fields) {
    var values = [];
    fields.map( (field) => {
        var tempObj = contract;
        var fieldExists = fieldPathExists(field, tempObj);

        if(fieldExists.length > 0) {
            values = values.concat(fieldExists);
        }
    } );

    if( values.length == 0 ) {
        return 0;
    }

    var uniques = makeUnique(values);
    if(uniques.length == 1) {
        return 1;
    }
    else {
        return 0;
    }
}

// Tipo: check-fields-bool
// Descripción: verifica que los campos existan, tengan valor, y su valor no sea "---" o "null".
// Parámetros:
//      contract: contrato a evaluar
//      fields: array de nombres de campo a verificar
function checkFieldsFlag(contract, fields) {
    var fieldsExist = fields.filter( function(field) {
        var fieldExists = null;

        // Si el campo viene con una condición
        if( isObject(field) ) {
            var fieldName = field.value;
            var conditions = field.conditions;
        }
        else {
            var fieldName = field;
            var conditions = null;
        }

        if(conditions != null) {
            return evaluateConditions(contract, conditions, fieldName);
        }
        else {
            fieldExists = fieldPathExists(fieldName, contract);
            return (fieldExists.length > 0)? true : false;
        }
    } );

    if( fields.length != fieldsExist.length ) {
        return 0;
    }
    else {
        return 1;
    }
}

function checkFieldsValueFlag() {
    return 0.5;
}

// Tipo: check-fields-inverse
// Descripción: verifica que los campos NO existan o NO tengan valor.
// Parámetros:
//      fields: array de nombres de campo a verificar
function checkNotFieldsFlag(contract, fields) {
    return 1 - checkFieldsFlag(contract, fields);
}

// Tipo: check-schema-bool
// Descripción: valida que el schema de todo el documento sea válido. Incluye los schemas de las extensiones.
// Parámetros:
//      contract: contrato a evaluar
//      schema: url del archivo con el schema a comparar
function checkSchemaFlag() {
    return 0.5;
}

// Tipo: check-sections-bool
// Descripción: Valida que cada una de las secciones principales de cada release y del compiledRelease contengan al menos un campo lleno. Si falla en algún caso, da false.
// Parámetros:
//      contract: contrato a evaluar
//      fields: array de campos a comparar.
function checkSectionsFlag(contract, fields) {
    var sectionsExist = fields.filter( function(field) { return contract.hasOwnProperty(field) && !isEmpty(contract[field]) } )

    if( fields.length != sectionsExist.length ) {
        return 0;
    }
    else {
        return 1;
    }
}

// Tipo: check-url-field
// Descripción: Chequea que el campo tenga una url
// Parámetros:
//      contract: contrato a evaluar
//      field: Campo que debería contener el URL
function checkUrlFieldFlag(contract, field) {
    if( contract.hasOwnProperty(field) ) {
        var url = contract[field];

        if (validUrl.isUri(url)){
            return 1;
        }
        else {
            return 0;
        }
    }
    else {
        return 0;
    }
}

// Tipo: date-difference-bool
// Descripción: Calcula la diferencia en días entre las fechas
// Parámetros:
//      contract: contrato a evaluar
//      fields.from fecha inicial que se resta de la siguiente
//      fields.to fecha final a la que se le resta la fecha inicial
//      difference.minimum: cantidad de días mínimos. si la resta es menor, da false.
//      difference.maximum: cantidad de días máximos. si la resta es mayor, da false.
function dateDifferenceFlag(contract, fields, difference) {
    var start = null;
    var end = null;
    var startValue = fieldPathExists(fields.from, contract);
    var endValue = fieldPathExists(fields.to, contract);

    if(startValue.length > 0) {
        if(isDate(startValue[0])) {
            start = startValue[0].toISOString();
        }
        else {
            start = startValue[0];
        }
    }
    else return 0;

    if(endValue.length > 0) {
        if(isDate(endValue[0])) {
            end = endValue[0].toISOString();
        }
        else {
            end = endValue[0];
        }
    }
    else return 0;

    start = new Date(start.split('T')[0]);
    end = new Date(end.split('T')[0]);
    var timeDifference = Math.abs(end.getTime() - start.getTime());
    var daysDifference = Math.ceil(timeDifference / (1000 * 3600 * 24));

    var conditionType = Object.keys(difference)[0];
    var conditionResult = false;
    if( isArray(difference[conditionType]) ) { // Si hay condiciones a evaluar
        difference[conditionType].map( (condition) => {
            if(evaluateDateCondition( contract, conditionType, condition, daysDifference ) == true) {
                conditionResult = true;
            }
        } );

        return conditionResult ? 1 : 0;
    }
    else { // Si maximum o minimum es solo un número
        switch(Object.keys(difference)[0]) {
            case 'maximum':
                if(parseInt(difference.maximum) < daysDifference) return 0;
                else return 1;
                break;
            case 'minimum':
                if(parseInt(difference.minimum) > daysDifference) return 0;
                else return 1;
                break;
        }
    }
}

module.exports = {
    checkAllFieldsFlag,
    checkComprensibilityFlag,
    checkDatesFlag,
    checkFieldsComparisonFlag,
    checkFieldsFlag,
    checkFieldsValueFlag,
    checkNotFieldsFlag,
    checkSchemaFlag,
    checkSectionsFlag,
    checkUrlFieldFlag,
    dateDifferenceFlag,
};
