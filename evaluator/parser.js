const fs = require('fs');

function getRuleField(rule, field) {
    if(rule.hasOwnProperty(field)) {
        return rule[field];
    }
    else {
        return null;
    }
}

function getIDFromString(string) {
    if(string.indexOf('-') >= 0)
        return string.split('-')[0];
    else
        return '';
}

function parseFlags(file) {
    // Read file
    let rawdata = fs.readFileSync(file);

    // Parse file
    let rules = JSON.parse(rawdata);

    // Build rulesObj
    let rulesArr = [];
    rules.map( (rule) => {
        var ruleObj = {
            id: rule.id,
            name: rule.name,
            category: rule.category,
            categoryID: getIDFromString(rule.id),
            flagType: rule.type,
            fields: getRuleField(rule, 'fields'),           // VALIDAR
            values: getRuleField(rule, 'values'),           // VALIDAR
            dates: getRuleField(rule, 'dates'),             // VALIDAR
            difference: getRuleField(rule, 'difference'),   // VALIDAR
        };

        rulesArr.push(ruleObj);
    } );

    return rulesArr;
}

function getCriteriaObject(flags) {
    var criteriaArr = [];
    flags.map( (flag) => {
        if( !criteriaArr.includes(flag.categoryID) ) {
            criteriaArr.push(flag.categoryID);
        }
    } );

    var criteriaObj = { total_score: 0 };
    criteriaArr.map( (item) => {
        criteriaObj[item] = 0;
    } );
    criteriaObj['total_score'] = 0;

    return criteriaObj;
}

module.exports = { parseFlags, getCriteriaObject };
