#include <stddef.h>

size_t count_positive(const int *values, size_t length) {
    size_t count = 0;
    for (size_t index = 0; index < length; index += 1) {
        if (values[index] > 0) {
            count += 1;
        }
    }
    return count;
}
