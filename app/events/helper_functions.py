from typing import Union

Matrix = list[list[str, str, str], list[str, str, str], list[str, str, str]]

def transpose_matrix(matrix) -> Matrix:
    t_matrix = get_empty_matrix()
    
    for i in range(len(matrix)):
        for j in range(len(matrix[i])):
            t_matrix[j][i] = matrix[i][j]

    return t_matrix

# Check if winning combination is present, then return winning fields
def check_matrix(matrix: Matrix) -> tuple[bool, Union[tuple[tuple[int,int], tuple[int,int], tuple[int,int]],tuple[None, None, None]]]:
    # Check diagonal
    if len(set([matrix[i][i] for i in range(len(matrix))])) == 1:
        if matrix[0][0] != '':
            return True, ((0,0), (1,1), (2,2))
    
    # Check reverse diagonal
    if len(set([matrix[i][len(matrix)-i-1] for i in range(len(matrix))])) == 1:
        if matrix[0][2] != '':
            return True, ((0,2), (1,1), (2,0))

    # Check rows
    for i in range(len(matrix)):
        if len(set(matrix[i])) == 1:
            if matrix[i][0] != '':
                return True, ((i,0), (i,1), (i,2))
    
    # Check columns
    t_matrix: Matrix = transpose_matrix(matrix)
    for i in range(len(t_matrix)):
        if len(set(t_matrix[i])) == 1:
            if t_matrix[i][0] != '':
                return True, ((0,i), (1,i), (2,i))

    return False, (None, None, None)

def check_if_matrix_is_full(matrix: Matrix) -> bool:
    for r in matrix:
        for c in r:
            if c == '':
                return False
    
    return True

def get_empty_matrix() -> Matrix:
    return [
        ['', '', ''],
        ['', '', ''],
        ['', '', '']
    ]

def clear_matrix(matrix: Matrix) -> Matrix:
    for i in range(len(matrix)):
        for j in range(len(matrix[i])):
            matrix[i][j] = ''

    return matrix
