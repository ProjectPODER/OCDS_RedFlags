const {
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
    dateDifferenceFlag
} = require('./redFlags/redFlags');
const launder = require('company-laundry');
const removeDiacritics = require('diacritics').remove;
const _ = require('lodash');

function simpleName(string) {
  return removeDiacritics(string)
    .replace(/[,.]/g, '') // remove commas and periods
    .toLowerCase();
}

function getContractYear(contract) {
    let startDate = '';

    if ( Object.prototype.toString.call(contract.contracts[0].period.startDate) === "[object Date]" )
        startDate = contract.contracts[0].period.startDate.toISOString();
    else
        startDate = contract.contracts[0].period.startDate;

    return startDate.split('-')[0];
}

function getFlagScore(contract, flag) {
    switch(flag.flagType) {
        case 'check-fields-rate':
            return checkFieldsRateFlag(contract, flag.fields);
        case 'check-dates-bool':
            return checkDatesFlag(contract, flag.fields, flag.values);
        case 'check-field-value-bool':
            return checkFieldsValueFlag(contract, flag.fields, flag.values);
        case 'check-fields-bool':
            return checkFieldsFlag(contract, flag.fields);
        case 'check-fields-inverse':
            return checkNotFieldsFlag(contract, flag.fields);
        case 'check-schema-bool':
            return checkSchemaFlag();
        case 'check-sections-rate':
            return checkSectionsFlag(contract, flag.fields);
        case 'check-url-bool':
            return checkUrlFieldFlag(contract, flag.fields);
        case 'comprensibility':
            return checkComprensibilityFlag(contract, flag.fields);
        case 'date-difference-bool':
            return dateDifferenceFlag(contract, flag.fields, flag.difference);
        case 'field-equality-bool':
            return checkFieldsComparisonFlag(contract, flag.fields);
    }
}

function getContractsFromRecord(record) {
    let contracts = [];
    record.contracts.map( (contract) => {
        let buyer_id = record.buyer.id;
        let buyer_party = record.parties.filter( (party) => party.id == buyer_id )[0];
        let award_id = contract.awardID;
        let award = record.awards.filter( (award) => award.id == award_id )[0];
        let supplier_ids = [];
        award.suppliers.map( (supplier) => supplier_ids.push(supplier.id) );
        let supplier_parties = record.parties.filter( (party) => supplier_ids.indexOf(party.id) >= 0 );

        let funder_party = null;
        let funder_arr = record.parties.filter( (party) => party.roles[0] == "funder" );
        if(funder_arr.length > 0) funder_party = funder_arr[0];

        let computed_contract = {};
        for( var x in record ) {
            switch(x) {
                case 'parties':
                    if(buyer_party)
                        computed_contract.parties = [ buyer_party ];
                    else
                        computed_contract.parties = [];
                    if(supplier_parties.length > 0)
                        supplier_parties.map( (supplier) => computed_contract.parties.push(supplier) );
                    if(funder_party)
                        computed_contract.parties.push(funder_party);
                    break;
                case 'awards':
                    computed_contract.awards = [ award ];
                    break;
                case 'contracts':
                    computed_contract.contracts = [ contract ];
                    break;
                case 'dataSource':
                case 'total_amount':
                    // Ignore these properties if present, not part of OCDS
                    break;
                default:
                    computed_contract[x] = record[x];
                    break;
            }
        }

        contracts.push(computed_contract);
    } );

    return contracts;
}

function evaluateFlags(record, flags, flagCollectionObj) {
    let contracts = getContractsFromRecord(record);
    let results = [];
    let tempFlags = JSON.stringify(flagCollectionObj);

    // Iterate over all contracts in the document, creating a separate evaluation for each...
    contracts.map( (contract) => {
        let year = getContractYear(contract);
        let contratoFlags = JSON.parse(tempFlags);
        contratoFlags.type = 'contract';

        delete contratoFlags.name;
        delete contratoFlags.entity;

        Object.assign(contratoFlags, { id: contract.contracts[0].id });
        Object.assign(contratoFlags, { ocid: contract.ocid });
        Object.assign(contratoFlags, { value: contract.contracts[0].value });

        if( contract.contracts[0].hasOwnProperty('period') ) {
            Object.assign(contratoFlags, { date_signed: new Date(contract.contracts[0].period.startDate) });
        }

        let contratoParties = [];
        contract.parties.map( (party) => {
            var role = party.hasOwnProperty('role')? party.role : party.roles[0];

            if(role == 'funder') {
                if(party.id.indexOf(';') > -1) {
                    var ids = party.id.split(';');
                    var names = party.name.split(';');

                    ids.map( (id, index) => {
                        var funderObj = {
                            id: id,
                            entity: role
                        }
                        contratoParties.push(funderObj);
                    } );
                }
                else {
                    var partyObj = {
                        id: party.id,
                        entity: role
                    }
                }
            }
            else {
                var partyObj = {
                    id: party.id,
                    entity: role
                }
            }

            // From the party with a role of "buyer" (Unidad Compradora) we extract its parent (Dependencia) and the state or municipality it belongs to
            if(role == 'buyer') {
                // Get the parent (Dependencia)
                if ( party.hasOwnProperty('memberOf') ) {
                  var dependencyObj = {
                    id: party.memberOf[0].id,
                    entity: 'dependency'
                  }
                  contratoParties.push(dependencyObj);
                }

                Object.assign( partyObj, { parent: { id: party.memberOf[0].id } } );

                // If the govLevel is "region", extract the state
                // If the govLevel is "city", extract the municipality and the state
                switch(party.govLevel) {
                    case 'region':
                        var stateObj = {
                            id: simpleName(launder(party.address.region)),
                            entity: 'state'
                        }
                        contratoParties.push(stateObj);
                        break;
                    case 'city':
                        var cityObj = {
                            id: simpleName(launder(party.address.locality)),
                            parent: { id: simpleName(launder(party.address.region)) },
                            entity: 'municipality'
                        }
                        contratoParties.push(cityObj);
                        break;
                    case 'country':
                        // Nothing to be done at country level...
                        break;
                }
            }
            if(partyObj) {
                contratoParties.push(partyObj);
            }
        } );

        // Iterate flags
        flags.map( (flag) => {
            let flagScore = getFlagScore(contract, flag);
            contratoFlags.flags[flag.categoryID][flag.id].push({ year: year, score: flagScore });
        } );

        // Add parties to this contract
        Object.assign(contratoFlags, { parties: contratoParties });

        results.push( { contratoFlags, year, contract: contract } );
    } );

    return results;
}

module.exports = evaluateFlags;
