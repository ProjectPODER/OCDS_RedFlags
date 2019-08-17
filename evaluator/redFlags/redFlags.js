const ocdsSchema = require('./ocdsSchema');
const validUrl = require('valid-url');
const removeDiacritics = require('diacritics').remove;

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
    return rate;
}

// Type: comprensibility
// Description: applies a custom algorithm to evaluate the comprensibility of a field or fields
// Parameters:
//      contract: the document to evaluate
//      fields: array of field names to verify
function checkComprensibilityFlag(contract, fields) {
    const comunes = [
        'a', 'ante', 'bajo', 'cabe', 'con', 'contra', 'de', 'desde', 'en', 'entre', 'hacia', 'hasta', 'para', 'por', 'segun', 'sin', 'sobre', 'tras',
        'la', 'las', 'el', 'los', 'del', 'que', 'mediante', 'su', 'sus', 'asi'
    ];
    const diccionario = [
        "abarrote","\\babarr","accesorio","actividad","adjudicaci.?n","administraci.?n","adquisici.?n","\\bapoyo\\b","\\barea\\b","arrendamiento",
            "articulo","asesor.?a","atenci.?n","avenida",
        "\\bbase\\b","bienes","blockchain",
        "\\bcabo\\b","\\bcalle\\b","camino","\\bcampo\\b","capacitaci.?n","carretera","\\bcat\\b","\\bcentr(al|o)\\b","ceremonia","ciudad","\\bclase\\b","coadyuvar","codigo","color",
            "comestible","compra","conservaci.?n","construcci.?n","consumible","consultoria","contrataci.?n","contrato","control","curso",
        "delegaci.?n","desarrollo","diferente","direct(a|o)","distribuci.?n","divers(a|o)","durante","\\bdos\\b",
        "edificio","ejecucion","ejercicio","elaboraci.?n","equipo","estado","especialidad","estructura","estudio","\\betapa\\b","evento",
        "farmacia","farmaceutic","federal",
        "\\bgasto\\b","general","\\bgrupo",
        "\\bherr\\b","herramienta","hospital",
        "impartir","informaci.?n","inmueble","instalaci.?n","institu(to|ci.?n)","insumo","integral","invitaci.?n",
        "laboratorio","licencia","licitaci.?n","localidad",
        "\\bmant(to)?\\b","mantenimiento","maquinaria","\\bmarca\\b","material?","medicamento","m.?dic(a|o)","medicina","\\bmedios\\b","mercancia",
            "m.?xico","mobiliario","modelo","municipio",
        "nacional","necesidad","\\bnuev(a|o)\\b",
        "\\bobras?\\b","oficina","operaci.?n","\\botros?\\b",
        "papel","parque","partida","pedido","personal","plaza","prestaci.?n","prestador","producci.?n","producto","profesional","programa","proyecto","p.?blica",
        "realiza","reconstrucci.'n","recurso","\\bred\\b","refacci.?n","regional","rehabilitaci.?n","reparaci.?n","restringida","reuni.?n","\\bropa\\b",
        "sector","seguimiento","servicio","sistema","soporte","subrogado","suministro","supervis","suscripci.?n","sustancia",
        "taller","tercero","traslado","tecnic","\\btipo\\b","trabajo","\\btramo\\b","transporte",
        "ubicado","unidad","\\buso\\b","utiles",
        "\\bzona\\b"
    ];
    const dict_regex = new RegExp(diccionario.join("|"), "i");

    var comprensible = false;

    fields.map( (field, index) => {
        var tempObj = contract;
        var values = fieldPathExists(field, tempObj);
        // console.log('Testing comprensibility for:', values[0]);

        if(values.length == 0 || values[0].length == 0 || typeof values[0] == 'number') { return; }

        var cleanValues = removeDiacritics(values[0]).toLowerCase(); // quitar acentos y diéresis, pasar a minúsculas
        var words = cleanValues.split(' ');
        // console.log('Words found:', words);

        var regexes = [];
        regexes.push("\\d");                // todos los números y códigos
        regexes.push("(\\W.*){3,}");        // cadena de texto con tres caracteres o más no alfanuméricos
        if(index < fields.length)
            regexes.push("\\w{1,4}\\.$");   // palabras que tengan menos de cinco letras y terminen “.” y no sean final de frase del título del contrato
        var re = new RegExp(regexes.join("|"), "i");
        var wordsLeft = words.filter( (word) => !re.test(word) );
        // console.log('Removing numbers, 3 or more non-alphanumeric characters, abbreviations.');
        // console.log('Words left:', wordsLeft);

        if(wordsLeft.length > 0) {
            let cleanWords = [];
            // Dejar sólo alfabéticos reemplazando los otros caracteres con “ ”
            wordsLeft.map( (word) => {
                let cleanWord = word.replace(/\W/, ' ');
                cleanWords.push( ...cleanWord.split(' ') );
            } );
            // console.log('Cleaning non-alphanumeric to spaces.');
            // console.log('Clean words:', cleanWords);

            // cualquier palabra que tenga dos letras o menos, artículos y preposiciones
            wordsLeft = cleanWords.filter( (word) => {
                return word.length > 2 && comunes.indexOf(word) == -1;
            } );
            // console.log('Taking out short words and prepositions.');
            // console.log('Words left:', wordsLeft);

            if(wordsLeft.length > 0) {
                // cualquier palabra que tenga el titulo que se repita en el nombre del party
                var partyNames = fieldPathExists('parties.id', tempObj);
                var partyWords = [];
                partyNames.map( (name) => partyWords.concat(name.split(' ')) );
                wordsLeft = wordsLeft.filter( (word) => partyWords.indexOf(word) < 0 );

                // cualquier palabra que esté en el diccionario de palabras irrelevantes para comprensibilidad del título
                if(wordsLeft.length > 0) {
                    wordsLeft = wordsLeft.filter( (word) => !dict_regex.test(word) );
                    if(wordsLeft.length > 0) {
                        // console.log('Words remaining:', wordsLeft);
                        comprensible = true;
                    }
                }
            }
        }
    } );
    // console.log('Comprensible:', comprensible);
    return (comprensible)? 1 : 0;
}

// Type: check-dates-bool
// Description: evaluates if the dates in a field or fields match any dates in the dates array, returns false if they do
// Parameters:
//      contract: the document to evaluate
//      fields: array of field names to verify
//      values: array of dates to compare with
function checkDatesFlag(contract, fields, values) {
    let badDateFound = false;

    fields.map( (field) => {
        var tempObj = contract;
        var fieldExists = fieldPathExists(field, tempObj);

        if(fieldExists.length > 0) {
            let thisDate = fieldExists[0];

            if(isDate(thisDate)) { // If the value is of Date type, convert to string
                thisDate = thisDate.toISOString();
            }
            else { // It's probably a string, make sure it represents a date
                if(!thisDate.match(/^\d{4}-\d{2}-\d{2}/)) {
                    return; // Skip this field, the value found is not a date
                }
            }
            let dayDate = thisDate.split('T')[0];

            // Compare with array of values
            values.map( (value) => {
                if(value.match(/\*/)) { // Contains an asterisk (*) so should be valid for all values for that date part
                    // Split found value and expected value into their date parts
                    let value_parts = value.split('-');
                    let field_parts = dayDate.split('-');
                    // Replace the asterisked part with the found value's part
                    for(let i=0; i<value_parts.length; i++) {
                        if(value_parts[i] == '*') {
                            value_parts[i] = field_parts[i];
                        }
                    }
                    // Put the dates back together and compare
                    let value_date = value_parts.join('-');
                    let field_date = field_parts.join('-');
                    if(value_date == field_date) {
                        badDateFound = true; // We have found a match!
                    }
                }
                else {
                    if(value == dayDate) {
                        badDateFound = true; // We have found a match!
                    }
                }
            } );
        }
    } );

    return (badDateFound)? 0 : 1;
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

// Type: check-sections-rate
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
            let url_clean = url;
            if(url.indexOf(' ')) url_clean = url.replace(' ', '%20');
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
