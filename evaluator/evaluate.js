const {
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
    dateDifferenceFlag
} = require('./redFlags/redFlags');

function getContractYear(contract) {
    let startDate = contract.contracts[0].period.startDate.toISOString();
    return startDate.split('-')[0];
}

function getFlagScore(contract, flag) {
    switch(flag.flagType) {
        case 'check-schema-bool':
            return checkSchemaFlag();
            break;
        case 'check-all-fields-rate':
            return checkAllFieldsFlag();
            break;
        case 'check-sections-bool':
            return checkSectionsFlag(contract, flag.fields);
            break;
        case 'date-difference-bool':
            return dateDifferenceFlag();
            break;
        case 'check-dates-bool':
            return checkDatesFlag();
            break;
        case 'check-field-value-bool':
            return checkFieldsValueFlag();
            break;
        case 'field-equality-bool':
            return checkFieldsComparisonFlag(contract, flag.fields);
            break;
        case 'check-fields-bool':
            return checkFieldsFlag(contract, flag.fields);
            break;
        case 'check-fields-inverse':
            return checkNotFieldsFlag(contract, flag.fields);
            break;
        case 'comprensibility':
            return checkComprensibilityFlag();
            break;
        case 'check-url-bool':
            return checkUrlFieldFlag(contract, flag.fields);
            break;
    }
}

function evaluateFlags(contract, flags, flagCollectionObj) {
    let year = getContractYear(contract);

    let contratoFlags = JSON.parse(JSON.stringify(flagCollectionObj));
    contratoFlags.type = 'contract';
    contratoFlags.id = contract.ocid;

    let contratoParties = [];
    contract.parties.map( (party) => {
        let partyObj = {
            id: party.id
        }
        contratoParties.push(partyObj);
    } );

    // Iterar sobre las reglas
    flags.map( (flag) => {
        let flagScore = getFlagScore(contract, flag);
        contratoFlags.flags[flag.categoryID][flag.id].push({ year: year, score: flagScore });
    } );

    // Devolver array [ contratoFlagObj, [ partyFlagObj ] ]
    return { contratoFlags, contratoParties, year };
}

module.exports = evaluateFlags;
