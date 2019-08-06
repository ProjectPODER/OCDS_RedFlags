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

function isNumeric(n) {
    return !isNaN(parseFloat(n)) && isFinite(n);
}

function isDate(d) {
    return typeof d.toISOString === "function";
}

// Parameters:
//      field: name of the field as a string separated by "."
//      tempObj: the object in which the fields should be found
// Return:
//      Array: the contents of the field, or empty array if the field was not found
function fieldPathExists(field, tempObj) {
    var fieldValues = [];
    var fieldPath = field.split('.');

    // Iterate over array with the components of the field
    for(var i=0; i<fieldPath.length; i++) {
        // Field does NOT exist in object
        if( typeof tempObj[fieldPath[i]] == 'undefined' ) {
            return fieldValues;
        }
        // Field has a value of null
        if(tempObj[fieldPath[i]] == null) {
            return fieldValues;
        }

        if( isArray(tempObj[fieldPath[i]]) ) { // Field is an array
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
        else if( isString(tempObj[fieldPath[i]]) || isNumeric(tempObj[fieldPath[i]]) ) { // Value of the field is a string or number
            if(i < fieldPath.length - 1) { // Arrived at a string or number while end of path has not been reached
                return fieldValues;
            }
            if(tempObj[fieldPath[i]] == '' || tempObj[fieldPath[i]] == '---' || tempObj[fieldPath[i]] == 'null') { // Arrived at empty string, '---' or 'null'
                return fieldValues;
            }
            fieldValues.push( tempObj[fieldPath[i]] );
            return fieldValues;
        }
        else if( isDate(tempObj[fieldPath[i]]) ) { // Value of the field is a date
            if(i < fieldPath.length - 1) { // Arrived at a date while end of path has not been reached
                return fieldValues;
            }
            fieldValues.push(tempObj[fieldPath[i]].toISOString());
            return fieldValues;
        }
        else if( tempObj.hasOwnProperty(fieldPath[i]) && !isEmpty(tempObj[fieldPath[i]]) ) { // fieldPath[i] is an object
            tempObj = tempObj[fieldPath[i]];
        }
        else { // None of the above...
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
            case 'or': // Check if any of the fields exists
                var or = conditions[condition].filter( (item) => {
                    var fieldvalue = fieldPathExists(item, contract);
                    return (fieldvalue.length > 0)? true : false;
                } );

                if(or.length > 0) { // Check the conditions inside the OR
                    fieldExists = fieldExists.concat(fieldPathExists(fieldName, contract));
                }
            default:
                var conditionField = Object.keys(conditions)[0];
                var conditionValue = conditions[conditionField];
                var foundValue = fieldPathExists( conditionField, contract );

                if(foundValue.length > 0) { // There is at least one result for the field in the condition
                    foundValue.map( (result) => {
                        // Commpare results obtained with expected value of the condition
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

    Object.keys(condition.conditions).map( (field) => {
        var fieldValue = fieldPathExists(field, contract);
        if(fieldValue.length > 0) {
            fieldValue.map( (value) => {
                if(isString(condition.conditions[field])) {
                    if(condition.conditions[field] == value) {
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
                else { // There is an OR
                    condition.conditions[field].or.map( (orValue) => {
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

// Type: check-fields-rate
// Description: verifies that fields exist, have a value, and the value is not "---" or "null".
// Parameters:
//      contract: the document to evaluate
//      fields: array of field names to verify
function checkFieldsRateFlag(contract, fields) {
    let rate = checkFieldsFlag(contract, fields, true);
    console.log('fieldss rate:', rate);
    process.exit(1);
    return rate;
}

// Type: comprensibility
// Description: applies a custom algorithm to evaluate the comprensibility of a field or fields
// Parameters:
//      contract: the document to evaluate
//      fields: array of field names to verify
function checkComprensibilityFlag(contract, fields) {
    var gibberish = false;
    fields.map( (field) => {
        var tempObj = contract;
        var values = fieldPathExists(field, tempObj);

        if(values.length > 0) {
            // Chequear para vada valor
        }
    } );

    return gibberish ? 0 : 1;
}

// Type: check-dates-bool
// Description: evaluates if the dates in a field or fields match any dates in the dates array, returns false if they do
// Parameters:
//      contract: the document to evaluate
//      fields: array of field names to verify
//      dates: array of dates to compare with
function checkDatesFlag() {
    // Chequear que exista el campo
    // Chequear que el campo sea de tipo fecha
    // Comparar con listado de fechas
    return 0.5;
}

// Type: field-equality-bool
// Description: compares the value of two fields, returns false if not equal
// Parameters:
//      contract: the document to evaluate
//      fields: array of fields to compare the values of
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

// Type: check-fields-bool
// Description: verifies that fields exist, have value, and their value is not "---" or "null".
// Parameters:
//      contract: the document to evaluate
//      fields: array of fields name to verify
//      rate: if true, return proportion of fields found vs. fields expected
function checkFieldsFlag(contract, fields, rate=false) {
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

    if(rate) {
        return fieldsExist.length / fields.length;
    }

    if( fields.length != fieldsExist.length ) {
        return 0;
    }
    else {
        return 1;
    }
}

// Type: check-field-value-bool
// Description: compares the value of a field to the specified parameter values, returns false if a match is found
// Parameters:
//      contract: the document to evaluate
//      fields: array of fields to compare
//      values: array of values to compare the field values with
function checkFieldsValueFlag(contract, fields, values) {
    var foundValue = false;

    if(fields.length > 0) {
        // Iterate over the fields to evaluate
        fields.map( (field) => {
            if(isString(field)) { // Plain field with no conditions
                var fieldValue = fieldPathExists(field, contract);
                if(fieldValue.length > 0) {
                    // Iterate over found values for the field
                    fieldValue.map( (fieldValue) => {
                        // Iterate over values to compare with the field values
                        values.map( (value) => {
                            if(value == fieldValue) { // A match is found...
                                foundValue = true;
                            }
                        } );
                    } );
                }
            }
            else {
                // Field is an object with conditions
                var fieldValue = fieldPathExists(field.value, contract);
                if(fieldValue.length > 0) {
                    // Iterate over the found values for the field
                    fieldValue.map( (itemValue) => {
                        switch( Object.keys(field.operation)[0] ) { // Apply a predefined function over the field value
                            case 'substr':
                                var operatedValue = itemValue.toString().substr(field.operation.substr[0]);
                                // Iterate over values to compare with the field values
                                values.map( (value) => {
                                    if(value == operatedValue) { // A match is found...
                                        foundValue = true;
                                    }
                                } );
                                break;
                        }
                    } );
                }
            }
        } );
        return foundValue ? 0 : 1;
    }
    else {
        return 0;
    }
}

// Type: check-fields-inverse
// Description: verifies that a field does NOT exist or has no value
// Parameters:
//      contract: the document to evaluate
//      fields: array of field names to verify
function checkNotFieldsFlag(contract, fields) {
    return 1 - checkFieldsFlag(contract, fields);
}

// Type: check-schema-bool
// Description: validates the document against a specified schema
// Parameters:
//      contract: the document to evaluate
//      schema: path to file with the schema to verify against
function checkSchemaFlag() {
    return 0;
}

// Type: check-sections-bool
// Description: validates that the document contains the top level fields contained in the fields array, returns percentage of fields found
// Parameters:
//      contract: the document to evaluate
//      fields: array of field names to verify
function checkSectionsFlag(contract, fields) {
    var sectionsExist = fields.filter( function(field) { return contract.hasOwnProperty(field) && !isEmpty(contract[field]) } )

    if( sectionsExist.length == 0 ) { // None of the fields exists in the document
        return 0;
    }
    else {
        // Return proportion of fields that exist in document
        return sectionsExist.length / fields.length;
    }
}

// Type: check-url-field
// Description: checks that a field is a valid URL
// Parameters:
//      contract: the document to evaluate
//      field: the field that should contain the URL
function checkUrlFieldFlag(contract, field) {
    var urls = fieldPathExists(field, contract);
    if(urls.length > 0) {
        found = false;
        urls.map( (url) => {
            if( validUrl.isUri(url) ) {
                found = true;
            }
        } );
        return (found)? 1 : 0;
    }
    else {
        return 0;
    }
}

// Type: date-difference-bool
// Description: calculates the difference in days between two dates
// Parameters:
//      contract: the document to evaluate
//      fields.from: start date
//      fields.to: end date
//      difference.minimum: number of days for which the difference must be higher, returns false if difference is lower
//      difference.maximum: number of days for which the difference must be lower, returns false if difference is higher
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
    if( isArray(difference[conditionType]) ) { // If there are additional conditions to evaluate
        difference[conditionType].map( (condition) => {
            if(evaluateDateCondition( contract, conditionType, condition, daysDifference ) == true) {
                conditionResult = true;
            }
        } );

        return conditionResult ? 1 : 0;
    }
    else { // If maximum of minimum is just one number
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
    checkFieldsRateFlag,
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
