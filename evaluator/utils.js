function accumulativeAverage( old_avg, old_count, value_to_add, count_to_add ) {
    // new_score = ( (old_value * count) + new_value ) / (count + 1)
    return ( (old_avg * old_count + value_to_add) / (old_count + count_to_add) );
}

module.exports = accumulativeAverage;
