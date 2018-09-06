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

function fieldPathExists(fieldPath, tempObj) {
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
            if(tempObj[fieldPath[i]] == '') {
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

// ---------- FLAG FUNCTIONS ----------

function checkAllFieldsFlag() {
    return 1;
}

function checkComprensibilityFlag() {
    return 1;
}

function checkDatesFlag() {
    return 1;
}

function checkFieldsComparisonFlag(contract, fields) {
    var values = [];
    fields.map( (field) => {
        var fieldPath = field.split('.');
        var tempObj = contract;
        var fieldExists = fieldPathExists(fieldPath, tempObj);
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

function checkFieldsFlag(contract, fields) {
    var fieldsExist = fields.filter( function(field) {
        if( isObject(field) ) {
            var fieldName = field.value;
            var condition = field.condition;
        }
        else {
            var fieldName = field;
            var condition = null;
        }

        var fieldPath = fieldName.split('.');
        var tempObj = contract;
        var fieldExists = fieldPathExists(fieldPath, tempObj);

        if(!fieldExists) {
            return 0;;
        }
        else {
            if(condition == null) {
                return 1;
            }
            else {
                // Pendiente evaluar bien la condición!!!
                return 1;
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
    return 1;
}

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

        var fieldPath = fieldName.split('.');
        var tempObj = contract;
        var fieldExists = fieldPathExists(fieldPath, tempObj);

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

function checkSchemaFlag() {
    return 1;
}

function checkSectionsFlag(contract, fields) {
    var sectionsExist = fields.filter( function(field) { return contract.hasOwnProperty(field) && !isEmpty(contract[field]) } )

    if( fields.length != sectionsExist.length ) {
        return 0;
    }
    else {
        return 1;
    }
}

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

function dateDifferenceFlag() {
    return 1;
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
