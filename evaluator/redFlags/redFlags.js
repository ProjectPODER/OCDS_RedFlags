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

function fieldPathExists(field, tempObj) {
    // console.log(field);
    var fieldPath = field.split('.');

    for(var i=0; i<fieldPath.length; i++) {
        if( typeof tempObj[fieldPath[i]] == 'undefined' ) {
            return false;
        }
        if( isArray(tempObj[fieldPath[i]]) ) {
            if( tempObj[fieldPath[i]].length > 0 ) {
                tempObj = tempObj[fieldPath[i]][0];
            }
            else {
                return false;
            }
        }
        else if( isString(tempObj[fieldPath[i]]) ) {
            if(tempObj[fieldPath[i]] == '' || tempObj[fieldPath[i]] == '---' || tempObj[fieldPath[i]] == 'null') {
                return false;
            }
            return tempObj[fieldPath[i]];
        }
        else if( isDate(tempObj[fieldPath[i]]) ) {
            return tempObj[fieldPath[i]].toISOString();
        }
        else if( tempObj.hasOwnProperty(fieldPath[i]) && !isEmpty(tempObj[fieldPath[i]]) ) {
            tempObj = tempObj[fieldPath[i]];
        }
        else {
            return false;
        }
    }
    return tempObj;
}

function makeUnique(arr){
    var uniqueArray=[];
    for(var i=0; i<arr.length; i++){
        if( !uniqueArray.includes(arr[i]) ){
            uniquearray.push(arr[i]);
        }
    }
    return uniqueArray;
}

function evaluateConditions(contract, conditions) {
    // console.log('conditions:', conditions);
    Object.keys(conditions).map( (condition, index) => {
        // console.log(condition);
        switch(condition) {
            case 'or':
                return conditions[condition].filter( (item) => fieldPathExists(item, contract) ).length > 0;
                break;
            default:
                var value = fieldPathExists(condition, contract);
                // console.log('condition value:', value);
                // console.log('comparison:', conditions[condition]);
                return (value == conditions[condition]);
                break;
        }
    } );
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
        if(fieldExists !== false) {
            values.push(fieldExists);
        }
        return field;
    } );

    if( values.filter( function(value) { return value !== false } ).length == 0 ) {
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
        if( isObject(field) ) {
            var fieldName = field.value;
            var conditions = field.conditions;
        }
        else {
            var fieldName = field;
            var conditions = null;
        }

        var tempObj = contract;
        var fieldExists = fieldPathExists(fieldName, tempObj);

        if(!fieldExists) {
            return false;
        }
        else {
            // console.log(contract.ocid);
            if(conditions == null) {
                return true;
            }
            else {
                // console.log(evaluateConditions(contract, conditions));
                // process.exit(0);
                return evaluateConditions(contract, conditions);
            }
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
    var fieldsExist = fields.filter( function(field) {
        if( isObject(field) ) {
            var fieldName = field.value;
            var condition = field.condition;
        }
        else {
            var fieldName = field;
            var condition = null;
        }

        var tempObj = contract;
        var fieldExists = fieldPathExists(fieldName, tempObj);

        if(!fieldExists) {
            return 1;
        }
        else {
            if(condition == null) {
                return 0;
            }
            else {
                // Pendiente evaluar bien la condición!!!
                return 0;
            }
        }

    } );

    if( fields.length != fieldsExist.length ) {
        return 0;
    }
    else {
        return 1;
    }
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
function dateDifferenceFlag() {
    return 0.5;
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
