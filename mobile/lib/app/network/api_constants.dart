class ApiConstants {
  static const String baseUrl = 'http://localhost:8000';
  static const String apiVersion = '/api/v1';
  
  // Auth endpoints
  static const String login = '$apiVersion/auth/login';
  static const String register = '$apiVersion/auth/register';
  static const String refresh = '$apiVersion/auth/refresh';
  static const String logout = '$apiVersion/auth/logout';
  static const String me = '$apiVersion/auth/me';
  
  // User endpoints
  static const String users = '$apiVersion/users';
  
  // Cards endpoints
  static const String cards = '$apiVersion/cards';
  static String cardDetails(String scryfallId) => '$cards/$scryfallId';
  static const String cardSearch = '$cards/search';
  
  // Collections endpoints
  static const String collections = '$apiVersion/collections';
  static String collection(String id) => '$collections/$id';
  static String collectionCards(String collectionId) => '$collections/$collectionId/cards';
  static String collectionCard(String collectionId, String cardId) => 
      '$collections/$collectionId/cards/$cardId';
  static String collectionImport(String collectionId) => '$collections/$collectionId/import';
  static String collectionExport(String collectionId) => '$collections/$collectionId/export';
  static String collectionStats(String collectionId) => '$collections/$collectionId/stats';
  
  // Scan endpoints
  static const String scan = '$apiVersion/scan';
  static const String scanUpload = '$scan/upload';
  static const String scanUploadBatch = '$scan/upload-batch';
  static const String scanBatches = '$scan/batches';
  static String scanBatch(String batchId) => '$scan/batches/$batchId';
  static String scanDetail(String scanId) => '$scan/scans/$scanId';
  static String scanConfirm(String scanId) => '$scan/scans/$scanId/confirm';
  static String scanReject(String scanId) => '$scan/scans/$scanId/reject';
  static String batchConfirm(String batchId) => '$scan/batches/$batchId/confirm';
  static const String scanStats = '$scan/stats';
  static const String pendingScans = '$scan/scans/pending';
  
  // Admin endpoints
  static const String admin = '$apiVersion/admin';
  static const String adminStats = '$admin/stats';
  static const String adminUsers = '$admin/users';
  static const String adminInvites = '$admin/invites';
}
