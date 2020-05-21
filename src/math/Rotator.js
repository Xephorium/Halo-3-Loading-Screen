
class Rotator {

    static rotateAroundYAxis(angle, point) {
        return this.multiplyMatrixAndPoint(this.getYRotationMatrix(angle), point);
    }

    static multiplyMatrixAndPoint(matrix, point) {
  
      //Give a simple variable name to each part of the matrix, a column and row number
      var c0r0 = matrix[ 0], c1r0 = matrix[ 1], c2r0 = matrix[ 2], c3r0 = matrix[ 3];
      var c0r1 = matrix[ 4], c1r1 = matrix[ 5], c2r1 = matrix[ 6], c3r1 = matrix[ 7];
      var c0r2 = matrix[ 8], c1r2 = matrix[ 9], c2r2 = matrix[10], c3r2 = matrix[11];

      //Now set some simple names for the point
      var x = point[0];
      var y = point[1];
      var z = point[2];

      //Multiply the point against each part of the 1st column, then add together
      var resultX = (x * c0r0) + (y * c0r1) + (z * c0r2);

      //Multiply the point against each part of the 2nd column, then add together
      var resultY = (x * c1r0) + (y * c1r1) + (z * c1r2);

      //Multiply the point against each part of the 3rd column, then add together
      var resultZ = (x * c2r0) + (y * c2r1) + (z * c2r2);

      return [resultX, resultY, resultZ];
    }

    static getYRotationMatrix(angle) {
      return [
        Math.cos(angle),   0, Math.sin(angle),   0,
                 0,   1,          0,   0,
       -Math.sin(angle),   0, Math.cos(angle),   0,
                 0,   0,          0,   1
      ];
    }
}