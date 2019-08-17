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
const accumulativeAverage = require('./utils.js');

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
                    if(funder_party) {
                        if(funder_party.name.indexOf(';')) {
                            let funder_names = funder_party.name.split(';');
                            let funder_ids = funder_party.id.split(';');
                            funder_names.map( (f, i) => {
                                let f_party = JSON.parse(JSON.stringify(funder_party));
                                f_party.name = f;
                                f_party.id = funder_ids[i];
                                computed_contract.parties.push(f_party);
                            } );
                        }
                        else {
                            computed_contract.parties.push(funder_party);
                        }
                    }
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
            var partyObj = {
                id: party.id,
                entity: role
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
                        var cityStateObj = {
                            id: simpleName(launder(party.address.region)),
                            entity: 'state'
                        }
                        contratoParties.push(cityStateObj);
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

function evaluateNodeFlags(roots, partyScores) {
    let nodeScores = {};

    for(var rootID in roots) {
        let branch = roots[rootID];

        // Obtener los IDs parties completos (fuera de los años)
        let ucID = branch.id;
        let dependenciaID = branch.parent_id;
        let supplierIDs = [];
        for(var childID in branch.children) {
            if(childID)
                supplierIDs.push( branch.children[childID].id );
        }

        // ---------- CONFIABILIDAD GLOBAL ----------

        // Promediar total_scores de todos los suppliers de esta UC, y calcular confiabilidad para los suppliers en el mismo loop
        let supplier_total_score_avg = 0;
        let supplier_total_score = 0;
        supplierIDs.map( (id) => {
            if(partyScores[id]) {
                supplier_total_score += partyScores[id].contract_score.total_score;
                if( !nodeScores[id] ) { // No hemos visto este supplier todavía
                    nodeScores[id] = {
                        nodeScore: {
                            conf: partyScores[ucID].contract_score.total_score,
                            aepm: 0,
                            aepc: 0,
                            tcr5: 0,
                            tcr10: 0,
                            tcr15: 0,
                            tcr20: 0,
                            mcr5: 0,
                            mcr10: 0,
                            mcr15: 0,
                            mcr20: 0,
                            celp: 0,
                            rla: 0,
                            ncap3: 0,
                            ncap4: 0,
                            ncap5: 0
                        },
                        numParties: 1,
                        years: {}
                    }
                }
                else {
                    nodeScores[id].nodeScore.conf = accumulativeAverage(nodeScores[id].nodeScore.conf, nodeScores[id].numParties, partyScores[ucID].contract_score.total_score, 1);
                    nodeScores[id].numParties ++;
                }
            }
        } );
        supplier_total_score_avg = supplier_total_score / supplierIDs.length;

        // Asignar confiabilidad a la UC
        if( !nodeScores[ucID] ) {
            nodeScores[ucID] = {
                nodeScore: {
                    conf: supplier_total_score_avg,
                    aepm: 0,
                    aepc: 0,
                    tcr5: 0,
                    tcr10: 0,
                    tcr15: 0,
                    tcr20: 0,
                    mcr5: 0,
                    mcr10: 0,
                    mcr15: 0,
                    mcr20: 0,
                    celp: 0,
                    rla: 0,
                    ncap3: 0,
                    ncap4: 0,
                    ncap5: 0
                },
                numParties: supplierIDs.length,
                years: {}
            }
        }
        else {
            nodeScores[ucID].nodeScore.conf = accumulativeAverage(nodeScores[ucID].nodeScore.conf, nodeScores[ucID].numParties, supplier_total_score, supplierIDs.length);
            nodeScores[ucID].numParties += supplierIDs.length;
        }
        if(dependenciaID) {
            // Calcular confiabilidad de la dependencia
            if( !nodeScores[dependenciaID] ) {
                nodeScores[dependenciaID] = {
                    nodeScore: {
                        conf: nodeScores[ucID].nodeScore.conf,
                        aepm: 0,
                        aepc: 0,
                        tcr5: 0,
                        tcr10: 0,
                        tcr15: 0,
                        tcr20: 0,
                        mcr5: 0,
                        mcr10: 0,
                        mcr15: 0,
                        mcr20: 0,
                        celp: 0,
                        rla: 0,
                        ncap3: 0,
                        ncap4: 0,
                        ncap5: 0
                    },
                    numParties: 0,
                    years: {}
                }
            }
            else {
                nodeScores[dependenciaID].nodeScore.conf = accumulativeAverage(nodeScores[dependenciaID].nodeScore.conf, nodeScores[dependenciaID].numParties, nodeScores[ucID].nodeScore.conf, 1);
                // nodeScores[dependenciaID].numParties++; No acumulamos aquí, porque necesitaremos este contador al final. Acumulamos al final.
            }
        }

        let years_seen = 0;
        let aepm_acc = 0;
        let aepc_acc = 0;
        let tcr5_acc = 0;
        let tcr10_acc = 0;
        let tcr15_acc = 0;
        let tcr20_acc = 0;
        let mcr5_acc = 0;
        let mcr10_acc = 0;
        let mcr15_acc = 0;
        let mcr20_acc = 0;
        let celp_acc = 0;
        let rla_acc = 0;
        let ncap3_acc = 0;
        let ncap4_acc = 0;
        let ncap5_acc = 0;
        for(var year in branch.years) {
            years_seen++;
            // ---------- CONFIABILIDAD POR AÑOS ----------

            let year_scores_avg = getSupplierYearScores(supplierIDs, partyScores, year);
            let uc_year_score = getBuyerYearScore(ucID, partyScores, year);

            // UC
            if( !nodeScores[ucID].years[year] ) {
                nodeScores[ucID].years[year] = {
                    nodeScore: {
                        conf: year_scores_avg.score,
                        aepm: { score:0 },
                        aepc: { score:0 },
                        tcr5: { score:0 },
                        tcr10: { score:0 },
                        tcr15: { score:0 },
                        tcr20: { score:0 },
                        mcr5: { score:0 },
                        mcr10: { score:0 },
                        mcr15: { score:0 },
                        mcr20: { score:0 },
                        celp: { score:0 },
                        rla: { score:0 },
                        ncap3: { score:0 },
                        ncap4: { score:0 },
                        ncap5: { score:0 }
                    },
                    numParties: year_scores_avg.count
                }
            }
            else {
                nodeScores[ucID].years[year].nodeScore.conf = accumulativeAverage(nodeScores[ucID].years[year].nodeScore.conf, nodeScores[ucID].years[year].numParties, year_scores_avg.score, year_scores_avg.count);
                nodeScores[ucID].years[year].numParties += year_scores_avg.count;
            }

            // Suppliers
            year_scores_avg.suppliers.map( (id) => {
                if( !nodeScores[id].years[year] ) {
                    nodeScores[id].years[year] = {
                        nodeScore: { conf: uc_year_score },
                        numParties: 1
                    }
                }
                else {
                    nodeScores[id].years[year].nodeScore.conf = accumulativeAverage(nodeScores[id].years[year].nodeScore.conf, nodeScores[id].years[year].numParties, uc_year_score, 1);
                    nodeScores[id].years[year].numParties++;
                }
            } );

            let seen = false;
            // ---------- AGENTE ECONOMICO PREPONDERANTE (MONTO) ----------
            let aepm_threshhold = 0.5; // More than aepm_threshhold % of contract amounts to same supplier
            let supplier_year_amounts = getSupplierYearAmounts(branch, year);
            let buyer_year_total = branch.years[year].c_a;

            nodeScores[ucID].years[year].nodeScore.aepm = { score: 0 };
            if(supplier_year_amounts.length > 0) {
                seen = false;
                supplier_year_amounts.map( (s) => {
                    if(s.amount >= buyer_year_total * aepm_threshhold) {
                        nodeScores[ucID].years[year].nodeScore.aepm = {
                            supplier: s.id,
                            value: s.amount / buyer_year_total,
                            score: 1
                        };
                        seen = true;
                    }
                } );
                if(seen) aepm_acc++;
            }

            // ---------- AGENTE ECONOMICO PREPONDERANTE (CANTIDAD) ----------
            let aepc_threshhold = 0.5; // More than aepm_threshhold % of contract amounts to same supplier
            let supplier_year_counts = getSupplierYearCounts(branch, year);
            let buyer_year_count = branch.years[year].c_c;

            nodeScores[ucID].years[year].nodeScore.aepc = { score: 0 };
            if(supplier_year_counts.length > 0) {
                seen = false;
                supplier_year_counts.map( (s) => {
                    if(s.count >= buyer_year_count * aepc_threshhold) {
                        nodeScores[ucID].years[year].nodeScore.aepc = {
                            supplier: s.id,
                            value: s.count / buyer_year_count,
                            score: 1
                        };
                        seen = true;
                    }
                } );
                if(seen) aepc_acc++;
            }

            // ---------- TITULO DE CONTRATO REPETIDO ----------
            let tcr5_threshhold = 0.05;
            let tcr10_threshhold = 0.1;
            let tcr15_threshhold = 0.15;
            let tcr20_threshhold = 0.2;
            let buyer_year_title_count = branch.years[year].c_c;

            nodeScores[ucID].years[year].nodeScore.tcr5 = { score: 0 };
            seen = false;
            for(var t in branch.years[year].titles) {
                if( branch.years[year].titles[t] >= buyer_year_title_count * tcr5_threshhold ) {
                    nodeScores[ucID].years[year].nodeScore.tcr5 = {
                        title: t,
                        value: branch.years[year].titles[t] / buyer_year_title_count,
                        score: 1
                    };
                    seen = true;
                }
            }
            if(seen) tcr5_acc++;

            seen = false;
            nodeScores[ucID].years[year].nodeScore.tcr10 = { score: 0 };
            for(var t in branch.years[year].titles) {
                if( branch.years[year].titles[t] >= buyer_year_title_count * tcr10_threshhold ) {
                    nodeScores[ucID].years[year].nodeScore.tcr10 = {
                        title: t,
                        value: branch.years[year].titles[t] / buyer_year_title_count,
                        score: 1
                    };
                    seen = true;
                }
            }
            if(seen) tcr10_acc++;

            seen = false;
            nodeScores[ucID].years[year].nodeScore.tcr15 = { score: 0 };
            for(var t in branch.years[year].titles) {
                if( branch.years[year].titles[t] >= buyer_year_title_count * tcr15_threshhold ) {
                    nodeScores[ucID].years[year].nodeScore.tcr15 = {
                        title: t,
                        value: branch.years[year].titles[t] / buyer_year_title_count,
                        score: 1
                    };
                    seen = true;
                }
            }
            if(seen) tcr15_acc++;

            seen = false;
            nodeScores[ucID].years[year].nodeScore.tcr20 = { score: 0 };
            for(var t in branch.years[year].titles) {
                if( branch.years[year].titles[t] >= buyer_year_title_count * tcr20_threshhold ) {
                    nodeScores[ucID].years[year].nodeScore.tcr20 = {
                        title: t,
                        value: branch.years[year].titles[t] / buyer_year_title_count,
                        score: 1
                    };
                    seen = true;
                }
            }
            if(seen) tcr20_acc++;

            // ---------- MONTO DE CONTRATO REPETIDO ----------
            let mcr5_threshhold = 0.05;
            let mcr10_threshhold = 0.1;
            let mcr15_threshhold = 0.15;
            let mcr20_threshhold = 0.2;
            let buyer_year_amount_count = branch.years[year].c_c;

            seen = false;
            nodeScores[ucID].years[year].nodeScore.mcr5 = { score: 0 };
            for(var a in branch.years[year].amounts) {
                if( branch.years[year].amounts[a] >= buyer_year_amount_count * mcr5_threshhold ) {
                    nodeScores[ucID].years[year].nodeScore.mcr5 = {
                        amount: a,
                        value: branch.years[year].amounts[a] / buyer_year_amount_count,
                        score: 1
                    };
                    seen = true;
                }
            }
            if(seen) mcr5_acc++;

            seen = false;
            nodeScores[ucID].years[year].nodeScore.mcr10 = { score: 0 };
            for(var a in branch.years[year].amounts) {
                if( branch.years[year].amounts[a] >= buyer_year_amount_count * mcr10_threshhold ) {
                    nodeScores[ucID].years[year].nodeScore.mcr10 = {
                        amount: a,
                        value: branch.years[year].amounts[a] / buyer_year_amount_count,
                        score: 1
                    };
                    seen = true;
                }
            }
            if(seen) mcr10_acc++;

            seen = false;
            nodeScores[ucID].years[year].nodeScore.mcr15 = { score: 0 };
            for(var a in branch.years[year].amounts) {
                if( branch.years[year].amounts[a] >= buyer_year_amount_count * mcr15_threshhold ) {
                    nodeScores[ucID].years[year].nodeScore.mcr15 = {
                        amount: a,
                        value: branch.years[year].amounts[a] / buyer_year_amount_count,
                        score: 1
                    };
                    seen = true;
                }
            }
            if(seen) mcr15_acc++;

            seen = false;
            nodeScores[ucID].years[year].nodeScore.mcr20 = { score: 0 };
            for(var a in branch.years[year].amounts) {
                if( branch.years[year].amounts[a] >= buyer_year_amount_count * mcr20_threshhold ) {
                    nodeScores[ucID].years[year].nodeScore.mcr20 = {
                        amount: a,
                        value: branch.years[year].amounts[a] / buyer_year_amount_count,
                        score: 1
                    };
                    seen = true;
                }
            }
            if(seen) mcr20_acc++;

            // ---------- CONCENTRACION DE EXCEPCIONES A LICITACION PUBLICA ----------
            let celp_threshhold = 0.333;
            let supplier_year_direct_amounts = getSupplierYearDirectAmounts(branch, year);
            let buyer_year_direct_total = branch.years[year].direct.c_a;

            nodeScores[ucID].years[year].nodeScore.celp = { score: 0 };
            if(supplier_year_direct_amounts.length > 0 && buyer_year_direct_total > 0) {
                seen = false;
                supplier_year_amounts.map( (s) => {
                    if(s.amount >= buyer_year_direct_total * celp_threshhold) {
                        nodeScores[ucID].years[year].nodeScore.celp = {
                            supplier: s.id,
                            value: s.amount / buyer_year_direct_total,
                            score: 1
                        };
                        seen = true;
                    }
                } );
                if(seen) celp_acc++;
            }

            // ---------- REBASA EL LIMITE ASIGNADO ----------
            let rla_threshhold = 0.3;
            nodeScores[ucID].years[year].nodeScore.rla = { score: 0 };
            if(buyer_year_direct_total > branch.years[year].c_a * rla_threshhold) {
                nodeScores[ucID].years[year].nodeScore.rla = {
                    value: buyer_year_direct_total / branch.years[year].c_a,
                    score: 1
                };
                rla_acc++;
            }

            // ---------- NUMERO DE CONTRATOS ARRIBA DEL PROMEDIO ----------
            let ncap3_threshhold = 0.03;
            let ncap4_threshhold = 0.04;
            let ncap5_threshhold = 0.05;

            seen = false;
            nodeScores[ucID].years[year].nodeScore.ncap3 = { score: 0 };
            for(var d in branch.years[year].dates) {
                if(branch.years[year].dates[d] >= buyer_year_count * ncap3_threshhold) {
                    nodeScores[ucID].years[year].nodeScore.ncap3 = {
                        date: d,
                        value: branch.years[year].dates[d] / buyer_year_count,
                        score: 1
                    };
                    seen = true;
                }
            }
            if(seen) ncap3_acc++;

            seen = false;
            nodeScores[ucID].years[year].nodeScore.ncap4 = { score: 0 };
            for(var d in branch.years[year].dates) {
                if(branch.years[year].dates[d] >= buyer_year_count * ncap4_threshhold) {
                    nodeScores[ucID].years[year].nodeScore.ncap4 = {
                        date: d,
                        value: branch.years[year].dates[d] / buyer_year_count,
                        score: 1
                    };
                    seen = true;
                }
            }
            if(seen) ncap4_acc++;

            seen = false;
            nodeScores[ucID].years[year].nodeScore.ncap5 = { score: 0 };
            for(var d in branch.years[year].dates) {
                if(branch.years[year].dates[d] >= buyer_year_count * ncap5_threshhold) {
                    nodeScores[ucID].years[year].nodeScore.ncap5 = {
                        date: d,
                        value: branch.years[year].dates[d] / buyer_year_count,
                        score: 1
                    };
                    seen = true;
                }
            }
            if(seen) ncap5_acc++;

            if(dependenciaID) {
                // Dependencia
                if( !nodeScores[dependenciaID].years[year] ) {
                    nodeScores[dependenciaID].years[year] = {
                        nodeScore: {
                            conf: nodeScores[ucID].years[year].nodeScore.conf,
                            aepm: nodeScores[ucID].years[year].nodeScore.aepm.score,
                            aepc: nodeScores[ucID].years[year].nodeScore.aepc.score,
                            tcr5: nodeScores[ucID].years[year].nodeScore.tcr5.score,
                            tcr10: nodeScores[ucID].years[year].nodeScore.tcr10.score,
                            tcr15: nodeScores[ucID].years[year].nodeScore.tcr15.score,
                            tcr20: nodeScores[ucID].years[year].nodeScore.tcr20.score,
                            mcr5: nodeScores[ucID].years[year].nodeScore.mcr5.score,
                            mcr10: nodeScores[ucID].years[year].nodeScore.mcr10.score,
                            mcr15: nodeScores[ucID].years[year].nodeScore.mcr15.score,
                            mcr20: nodeScores[ucID].years[year].nodeScore.mcr20.score,
                            celp: nodeScores[ucID].years[year].nodeScore.celp.score,
                            rla: nodeScores[ucID].years[year].nodeScore.rla.score,
                            ncap3: nodeScores[ucID].years[year].nodeScore.ncap3.score,
                            ncap4: nodeScores[ucID].years[year].nodeScore.ncap4.score,
                            ncap5: nodeScores[ucID].years[year].nodeScore.ncap5.score
                        },
                        numParties: 1
                    }
                }
                else {
                    nodeScores[dependenciaID].years[year].nodeScore.conf = accumulativeAverage(nodeScores[dependenciaID].years[year].nodeScore.conf, nodeScores[dependenciaID].years[year].numParties, nodeScores[ucID].years[year].nodeScore.conf, 1);
                    nodeScores[dependenciaID].years[year].nodeScore.aepm = accumulativeAverage(nodeScores[dependenciaID].years[year].nodeScore.aepm, nodeScores[dependenciaID].years[year].numParties, nodeScores[ucID].years[year].nodeScore.aepm.score, 1);
                    nodeScores[dependenciaID].years[year].nodeScore.aepc = accumulativeAverage(nodeScores[dependenciaID].years[year].nodeScore.aepc, nodeScores[dependenciaID].years[year].numParties, nodeScores[ucID].years[year].nodeScore.aepc.score, 1);
                    nodeScores[dependenciaID].years[year].nodeScore.tcr5 = accumulativeAverage(nodeScores[dependenciaID].years[year].nodeScore.tcr5, nodeScores[dependenciaID].years[year].numParties, nodeScores[ucID].years[year].nodeScore.tcr5.score, 1);
                    nodeScores[dependenciaID].years[year].nodeScore.tcr10 = accumulativeAverage(nodeScores[dependenciaID].years[year].nodeScore.tcr10, nodeScores[dependenciaID].years[year].numParties, nodeScores[ucID].years[year].nodeScore.tcr10.score, 1);
                    nodeScores[dependenciaID].years[year].nodeScore.tcr15 = accumulativeAverage(nodeScores[dependenciaID].years[year].nodeScore.tcr15, nodeScores[dependenciaID].years[year].numParties, nodeScores[ucID].years[year].nodeScore.tcr15.score, 1);
                    nodeScores[dependenciaID].years[year].nodeScore.tcr20 = accumulativeAverage(nodeScores[dependenciaID].years[year].nodeScore.tcr20, nodeScores[dependenciaID].years[year].numParties, nodeScores[ucID].years[year].nodeScore.tcr20.score, 1);
                    nodeScores[dependenciaID].years[year].nodeScore.mcr5 = accumulativeAverage(nodeScores[dependenciaID].years[year].nodeScore.mcr5, nodeScores[dependenciaID].years[year].numParties, nodeScores[ucID].years[year].nodeScore.mcr5.score, 1);
                    nodeScores[dependenciaID].years[year].nodeScore.mcr10 = accumulativeAverage(nodeScores[dependenciaID].years[year].nodeScore.mcr10, nodeScores[dependenciaID].years[year].numParties, nodeScores[ucID].years[year].nodeScore.mcr10.score, 1);
                    nodeScores[dependenciaID].years[year].nodeScore.mcr15 = accumulativeAverage(nodeScores[dependenciaID].years[year].nodeScore.mcr15, nodeScores[dependenciaID].years[year].numParties, nodeScores[ucID].years[year].nodeScore.mcr15.score, 1);
                    nodeScores[dependenciaID].years[year].nodeScore.mcr20 = accumulativeAverage(nodeScores[dependenciaID].years[year].nodeScore.mcr20, nodeScores[dependenciaID].years[year].numParties, nodeScores[ucID].years[year].nodeScore.mcr20.score, 1);
                    nodeScores[dependenciaID].years[year].nodeScore.celp = accumulativeAverage(nodeScores[dependenciaID].years[year].nodeScore.celp, nodeScores[dependenciaID].years[year].numParties, nodeScores[ucID].years[year].nodeScore.celp.score, 1);
                    nodeScores[dependenciaID].years[year].nodeScore.rla = accumulativeAverage(nodeScores[dependenciaID].years[year].nodeScore.rla, nodeScores[dependenciaID].years[year].numParties, nodeScores[ucID].years[year].nodeScore.rla.score, 1);
                    nodeScores[dependenciaID].years[year].nodeScore.ncap3 = accumulativeAverage(nodeScores[dependenciaID].years[year].nodeScore.ncap3, nodeScores[dependenciaID].years[year].numParties, nodeScores[ucID].years[year].nodeScore.ncap3.score, 1);
                    nodeScores[dependenciaID].years[year].nodeScore.ncap4 = accumulativeAverage(nodeScores[dependenciaID].years[year].nodeScore.ncap4, nodeScores[dependenciaID].years[year].numParties, nodeScores[ucID].years[year].nodeScore.ncap4.score, 1);
                    nodeScores[dependenciaID].years[year].nodeScore.ncap5 = accumulativeAverage(nodeScores[dependenciaID].years[year].nodeScore.ncap5, nodeScores[dependenciaID].years[year].numParties, nodeScores[ucID].years[year].nodeScore.ncap5.score, 1);
                    nodeScores[dependenciaID].years[year].numParties++;
                }
            }
        }

        // Promedios globales por banderas de nodo para la UC
        nodeScores[ucID].nodeScore.aepm = aepm_acc / years_seen;
        nodeScores[ucID].nodeScore.aepc = aepc_acc / years_seen;
        nodeScores[ucID].nodeScore.tcr5 = tcr5_acc / years_seen;
        nodeScores[ucID].nodeScore.tcr10 = tcr10_acc / years_seen;
        nodeScores[ucID].nodeScore.tcr15 = tcr15_acc / years_seen;
        nodeScores[ucID].nodeScore.tcr20 = tcr20_acc / years_seen;
        nodeScores[ucID].nodeScore.mcr5 = mcr5_acc / years_seen;
        nodeScores[ucID].nodeScore.mcr10 = mcr10_acc / years_seen;
        nodeScores[ucID].nodeScore.mcr15 = mcr15_acc / years_seen;
        nodeScores[ucID].nodeScore.mcr20 = mcr20_acc / years_seen;
        nodeScores[ucID].nodeScore.celp = celp_acc / years_seen;
        nodeScores[ucID].nodeScore.rla = rla_acc / years_seen;
        nodeScores[ucID].nodeScore.ncap3 = ncap3_acc / years_seen;
        nodeScores[ucID].nodeScore.ncap4 = ncap4_acc / years_seen;
        nodeScores[ucID].nodeScore.ncap5 = ncap5_acc / years_seen;

        if(dependenciaID) {
            // Promedios globales por banderas de nodo para la dependencia
            nodeScores[dependenciaID].nodeScore.aepm = accumulativeAverage(nodeScores[dependenciaID].nodeScore.aepm, nodeScores[dependenciaID].numParties, nodeScores[ucID].nodeScore.aepm, 1);
            nodeScores[dependenciaID].nodeScore.aepc = accumulativeAverage(nodeScores[dependenciaID].nodeScore.aepc, nodeScores[dependenciaID].numParties, nodeScores[ucID].nodeScore.aepc, 1);
            nodeScores[dependenciaID].nodeScore.tcr5 = accumulativeAverage(nodeScores[dependenciaID].nodeScore.tcr5, nodeScores[dependenciaID].numParties, nodeScores[ucID].nodeScore.tcr5, 1);
            nodeScores[dependenciaID].nodeScore.tcr10 = accumulativeAverage(nodeScores[dependenciaID].nodeScore.tcr10, nodeScores[dependenciaID].numParties, nodeScores[ucID].nodeScore.tcr10, 1);
            nodeScores[dependenciaID].nodeScore.tcr15 = accumulativeAverage(nodeScores[dependenciaID].nodeScore.tcr15, nodeScores[dependenciaID].numParties, nodeScores[ucID].nodeScore.tcr15, 1);
            nodeScores[dependenciaID].nodeScore.tcr20 = accumulativeAverage(nodeScores[dependenciaID].nodeScore.tcr20, nodeScores[dependenciaID].numParties, nodeScores[ucID].nodeScore.tcr20, 1);
            nodeScores[dependenciaID].nodeScore.mcr5 = accumulativeAverage(nodeScores[dependenciaID].nodeScore.mcr5, nodeScores[dependenciaID].numParties, nodeScores[ucID].nodeScore.mcr5, 1);
            nodeScores[dependenciaID].nodeScore.mcr10 = accumulativeAverage(nodeScores[dependenciaID].nodeScore.mcr10, nodeScores[dependenciaID].numParties, nodeScores[ucID].nodeScore.mcr10, 1);
            nodeScores[dependenciaID].nodeScore.mcr15 = accumulativeAverage(nodeScores[dependenciaID].nodeScore.mcr15, nodeScores[dependenciaID].numParties, nodeScores[ucID].nodeScore.mcr15, 1);
            nodeScores[dependenciaID].nodeScore.mcr20 = accumulativeAverage(nodeScores[dependenciaID].nodeScore.mcr20, nodeScores[dependenciaID].numParties, nodeScores[ucID].nodeScore.mcr20, 1);
            nodeScores[dependenciaID].nodeScore.celp = accumulativeAverage(nodeScores[dependenciaID].nodeScore.celp, nodeScores[dependenciaID].numParties, nodeScores[ucID].nodeScore.celp, 1);
            nodeScores[dependenciaID].nodeScore.rla = accumulativeAverage(nodeScores[dependenciaID].nodeScore.rla, nodeScores[dependenciaID].numParties, nodeScores[ucID].nodeScore.rla, 1);
            nodeScores[dependenciaID].nodeScore.ncap3 = accumulativeAverage(nodeScores[dependenciaID].nodeScore.ncap3, nodeScores[dependenciaID].numParties, nodeScores[ucID].nodeScore.ncap3, 1);
            nodeScores[dependenciaID].nodeScore.ncap4 = accumulativeAverage(nodeScores[dependenciaID].nodeScore.ncap4, nodeScores[dependenciaID].numParties, nodeScores[ucID].nodeScore.ncap4, 1);
            nodeScores[dependenciaID].nodeScore.ncap5 = accumulativeAverage(nodeScores[dependenciaID].nodeScore.ncap5, nodeScores[dependenciaID].numParties, nodeScores[ucID].nodeScore.ncap5, 1);
            nodeScores[dependenciaID].numParties++;
        }

        // Cleanup...
        branch = null;
        roots[rootID] = null;
    }

    return nodeScores;
}

function getSupplierYearDirectAmounts(branch, year) {
    let amounts = [];
    for(var s in branch.children) {
        let supplier = branch.children[s];
        for(var s_year in supplier.years) {
            if(s_year == year)
                amounts.push( { id: supplier.id, amount: supplier.years[s_year].direct.c_a } );
        }
    }
    return amounts;
}

function getSupplierYearAmounts(branch, year) {
    let amounts = [];
    for(var s in branch.children) {
        let supplier = branch.children[s];
        for(var s_year in supplier.years) {
            if(s_year == year)
                amounts.push( { id: supplier.id, amount: supplier.years[s_year].c_a } );
        }
    }
    return amounts;
}

function getSupplierYearCounts(branch, year) {
    let counts = [];
    for(var s in branch.children) {
        let supplier = branch.children[s];
        for(var s_year in supplier.years) {
            if(s_year == year)
                counts.push( { id: supplier.id, count: supplier.years[s_year].c_c } );
        }
    }
    return counts;
}

function getBuyerYearScore(id, partyScores, year) {
    let score = 0;
    if(partyScores[id]) {
        partyScores[id].years.map( (b_year) => {
            if(b_year.year == year) {
                score = b_year.contract_score.total_score;
            }
        } );
    }

    return score;
}

function getSupplierYearScores(supplierIDs, partyScores, year) {
    let total_score = 0;
    let num_suppliers = 0;
    let year_ids = [];

    supplierIDs.map( (id) => {
        if(partyScores[id]) {
            partyScores[id].years.map( (s_year) => {
                if(s_year.year == year) {
                    total_score += s_year.contract_score.total_score;
                    num_suppliers++;
                    year_ids.push(id);
                }
            } );
        }
    } );

    return { score: total_score / num_suppliers, count: num_suppliers, suppliers: year_ids };
}

module.exports = { evaluateFlags, evaluateNodeFlags };
